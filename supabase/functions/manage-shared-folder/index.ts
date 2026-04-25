/// <reference path="../_shared/deno.d.ts" />
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    {
      auth: {
        persistSession: false,
      },
    }
  );

  try {
    const requestBody = await req.json();
    const { action, folder_id, folder_name, invitee_email, permission_level, collaborator_user_id } = requestBody;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Authorization required' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse({ error: 'Invalid authorization' }, 401);
    }

    const currentUserId = user.id;

    // Helper to check user's permission level for a folder
    const getUserPermission = async (fId: string, uId: string) => {
      const { data, error } = await supabaseAdmin
        .from('folder_collaborators')
        .select('permission_level')
        .eq('folder_id', fId)
        .eq('user_id', uId)
        .eq('status', 'accepted')
        .single();
      if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
        console.error('Error fetching user permission:', error);
      }
      return data?.permission_level;
    };

    // Helper to check if current user is the owner of the folder
    const isFolderOwner = async (fId: string, uId: string) => {
      const { data, error } = await supabaseAdmin
        .from('user_folders')
        .select('user_id')
        .eq('id', fId)
        .single();
      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching folder owner:', error);
      }
      return data?.user_id === uId;
    };

    switch (action) {
      case 'create': {
        if (!folder_name) {
          return jsonResponse({ error: 'Folder name is required' }, 400);
        }

        console.log('Creating shared folder:', { folder_name, user_id: currentUserId });

        const { data, error } = await supabaseAdmin
          .from('user_folders')
          .insert({
            user_id: currentUserId,
            name: folder_name,
            is_shared: true,
          })
          .select()
          .single();

        if (error) {
          console.error('Error creating shared folder:', error);
          return jsonResponse({ error: 'Failed to create shared folder' }, 500);
        }

        console.log('Shared folder created successfully:', data);

        // Add owner as admin collaborator
        const { error: collabError } = await supabaseAdmin
          .from('folder_collaborators')
          .insert({
            folder_id: data.id,
            user_id: currentUserId,
            permission_level: 'admin',
            status: 'accepted',
            invited_by_user_id: currentUserId,
          });

        if (collabError) {
          console.error('Error adding owner as collaborator:', collabError);
          // Attempt to delete the folder if collaborator creation fails
          await supabaseAdmin.from('user_folders').delete().eq('id', data.id);
          return jsonResponse({ error: 'Failed to initialize shared folder' }, 500);
        }

        console.log('Owner added as collaborator successfully');
        return jsonResponse({ success: true, folder: data, message: 'Shared folder created successfully' });
      }

      case 'invite': {
        if (!folder_id || !invitee_email || !permission_level) {
          return jsonResponse({ error: 'Folder ID, invitee email, and permission level are required' }, 400);
        }

        const isOwner = await isFolderOwner(folder_id, currentUserId);
        const currentUserPerm = await getUserPermission(folder_id, currentUserId);

        if (!isOwner && currentUserPerm !== 'admin') {
          return jsonResponse({ error: 'Only folder owners or admins can invite collaborators' }, 403);
        }

        const { data: inviteeUser, error: inviteeError } = await supabaseAdmin
          .from('users') // Assuming 'users' table exists or use auth.users directly
          .select('id')
          .eq('email', invitee_email)
          .single();

        if (inviteeError || !inviteeUser) {
          return jsonResponse({ error: 'Invitee user not found' }, 404);
        }

        const { data, error } = await supabaseAdmin
          .from('folder_collaborators')
          .insert({
            folder_id,
            user_id: inviteeUser.id,
            permission_level,
            status: 'pending',
            invited_by_user_id: currentUserId,
          })
          .select()
          .single();

        if (error) {
          if (error.code === '23505') { // Unique violation
            return jsonResponse({ error: 'User already invited or is a collaborator' }, 409);
          }
          console.error('Error inviting collaborator:', error);
          return jsonResponse({ error: 'Failed to invite collaborator' }, 500);
        }

        // TODO: Send email notification to invitee

        return jsonResponse({ success: true, invitation: data, message: 'Invitation sent successfully' });
      }

      case 'update_permission': {
        if (!folder_id || !collaborator_user_id || !permission_level) {
          return jsonResponse({ error: 'Folder ID, collaborator user ID, and new permission level are required' }, 400);
        }

        const isOwner = await isFolderOwner(folder_id, currentUserId);
        const currentUserPerm = await getUserPermission(folder_id, currentUserId);

        if (!isOwner && currentUserPerm !== 'admin') {
          return jsonResponse({ error: 'Only folder owners or admins can update permissions' }, 403);
        }

        const { data, error } = await supabaseAdmin
          .from('folder_collaborators')
          .update({ permission_level })
          .eq('folder_id', folder_id)
          .eq('user_id', collaborator_user_id)
          .select()
          .single();

        if (error) {
          console.error('Error updating permission:', error);
          return jsonResponse({ error: 'Failed to update collaborator permission' }, 500);
        }

        return jsonResponse({ success: true, collaborator: data, message: 'Collaborator permission updated' });
      }

      case 'remove_collaborator': {
        if (!folder_id || !collaborator_user_id) {
          return jsonResponse({ error: 'Folder ID and collaborator user ID are required' }, 400);
        }

        const isOwner = await isFolderOwner(folder_id, currentUserId);
        const currentUserPerm = await getUserPermission(folder_id, currentUserId);

        // Allow self-removal or removal by owner/admin
        if (collaborator_user_id === currentUserId) {
          // Self-removal
          const { error } = await supabaseAdmin
            .from('folder_collaborators')
            .delete()
            .eq('folder_id', folder_id)
            .eq('user_id', currentUserId);

          if (error) {
            console.error('Error removing self from folder:', error);
            return jsonResponse({ error: 'Failed to remove self from folder' }, 500);
          }
          return jsonResponse({ success: true, message: 'Successfully removed from folder' });
        } else if (!isOwner && currentUserPerm !== 'admin') {
          return jsonResponse({ error: 'Only folder owners or admins can remove other collaborators' }, 403);
        }

        const { error } = await supabaseAdmin
          .from('folder_collaborators')
          .delete()
          .eq('folder_id', folder_id)
          .eq('user_id', collaborator_user_id);

        if (error) {
          console.error('Error removing collaborator:', error);
          return jsonResponse({ error: 'Failed to remove collaborator' }, 500);
        }

        return jsonResponse({ success: true, message: 'Collaborator removed successfully' });
      }

      default:
        return jsonResponse({ error: 'Invalid action' }, 400);
    }
  } catch (error: unknown) {
    console.error('Edge Function error:', error);
    const details = error instanceof Error ? error.message : String(error);
    return jsonResponse({
      error: 'Server error',
      details
    }, 500);
  }
});
