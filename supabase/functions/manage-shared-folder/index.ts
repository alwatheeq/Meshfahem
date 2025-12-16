import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { handleCorsPreflight } from '../_shared/cors.ts';
import { jsonResponse, errorResponse, successResponse } from '../_shared/response.ts';
import { authenticateUser, getSupabaseClient } from '../_shared/auth.ts';
import { validateMethod, parseJsonBody, validateRequiredFields, validateNonEmptyString } from '../_shared/validation.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight();
  }

  const methodError = validateMethod(req, ['POST']);
  if (methodError) {
    return methodError;
  }

  const supabaseAdmin = getSupabaseClient();

  try {
    const bodyResult = await parseJsonBody<{
      action: string;
      folder_id?: string;
      folder_name?: string;
      invitee_email?: string;
      permission_level?: string;
      collaborator_user_id?: string;
    }>(req);
    if (bodyResult.error) {
      return bodyResult.error;
    }

    const { action, folder_id, folder_name, invitee_email, permission_level, collaborator_user_id } = bodyResult.data;

    const authResult = await authenticateUser(req, true);
    if (authResult.error || !authResult.user) {
      return errorResponse(authResult.error || 'Unauthorized', 401);
    }

    const currentUserId = authResult.user.id;

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
        const folderNameError = validateNonEmptyString(folder_name, 'folder_name');
        if (folderNameError) {
          return errorResponse(folderNameError, 400);
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
          return errorResponse('Failed to create shared folder', 500);
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
          return errorResponse('Failed to initialize shared folder', 500);
        }

        console.log('Owner added as collaborator successfully');
        return successResponse({ folder: data, message: 'Shared folder created successfully' });
      }

      case 'invite': {
        const missingFields = validateRequiredFields(
          { folder_id, invitee_email, permission_level },
          ['folder_id', 'invitee_email', 'permission_level']
        );
        if (missingFields) {
          return errorResponse(missingFields, 400);
        }

        const emailError = validateNonEmptyString(invitee_email, 'invitee_email');
        if (emailError) {
          return errorResponse(emailError, 400);
        }

        const isOwner = await isFolderOwner(folder_id!, currentUserId);
        const currentUserPerm = await getUserPermission(folder_id!, currentUserId);

        if (!isOwner && currentUserPerm !== 'admin') {
          return errorResponse('Only folder owners or admins can invite collaborators', 403);
        }

        const { data: inviteeUser, error: inviteeError } = await supabaseAdmin
          .from('users') // Assuming 'users' table exists or use auth.users directly
          .select('id')
          .eq('email', invitee_email)
          .single();

        if (inviteeError || !inviteeUser) {
          return errorResponse('Invitee user not found', 404);
        }

        const { data, error } = await supabaseAdmin
          .from('folder_collaborators')
          .insert({
            folder_id: folder_id!,
            user_id: inviteeUser.id,
            permission_level: permission_level!,
            status: 'pending',
            invited_by_user_id: currentUserId,
          })
          .select()
          .single();

        if (error) {
          if (error.code === '23505') { // Unique violation
            return errorResponse('User already invited or is a collaborator', 409);
          }
          console.error('Error inviting collaborator:', error);
          return errorResponse('Failed to invite collaborator', 500);
        }

        // TODO: Send email notification to invitee

        return successResponse({ invitation: data, message: 'Invitation sent successfully' });
      }

      case 'update_permission': {
        const missingFields = validateRequiredFields(
          { folder_id, collaborator_user_id, permission_level },
          ['folder_id', 'collaborator_user_id', 'permission_level']
        );
        if (missingFields) {
          return errorResponse(missingFields, 400);
        }

        const isOwner = await isFolderOwner(folder_id!, currentUserId);
        const currentUserPerm = await getUserPermission(folder_id!, currentUserId);

        if (!isOwner && currentUserPerm !== 'admin') {
          return errorResponse('Only folder owners or admins can update permissions', 403);
        }

        const { data, error } = await supabaseAdmin
          .from('folder_collaborators')
          .update({ permission_level: permission_level! })
          .eq('folder_id', folder_id!)
          .eq('user_id', collaborator_user_id!)
          .select()
          .single();

        if (error) {
          console.error('Error updating permission:', error);
          return errorResponse('Failed to update collaborator permission', 500);
        }

        return successResponse({ collaborator: data, message: 'Collaborator permission updated' });
      }

      case 'remove_collaborator': {
        const missingFields = validateRequiredFields(
          { folder_id, collaborator_user_id },
          ['folder_id', 'collaborator_user_id']
        );
        if (missingFields) {
          return errorResponse(missingFields, 400);
        }

        const isOwner = await isFolderOwner(folder_id!, currentUserId);
        const currentUserPerm = await getUserPermission(folder_id!, currentUserId);

        // Allow self-removal or removal by owner/admin
        if (collaborator_user_id === currentUserId) {
          // Self-removal
          const { error } = await supabaseAdmin
            .from('folder_collaborators')
            .delete()
            .eq('folder_id', folder_id!)
            .eq('user_id', currentUserId);

          if (error) {
            console.error('Error removing self from folder:', error);
            return errorResponse('Failed to remove self from folder', 500);
          }
          return successResponse({ message: 'Successfully removed from folder' });
        } else if (!isOwner && currentUserPerm !== 'admin') {
          return errorResponse('Only folder owners or admins can remove other collaborators', 403);
        }

        const { error } = await supabaseAdmin
          .from('folder_collaborators')
          .delete()
          .eq('folder_id', folder_id!)
          .eq('user_id', collaborator_user_id!);

        if (error) {
          console.error('Error removing collaborator:', error);
          return errorResponse('Failed to remove collaborator', 500);
        }

        return successResponse({ message: 'Collaborator removed successfully' });
      }

      default:
        return errorResponse('Invalid action', 400);
    }
  } catch (error) {
    console.error('Edge Function error:', error);
    return errorResponse(
      `Server error: ${error instanceof Error ? error.message : String(error)}`,
      500
    );
  }
});