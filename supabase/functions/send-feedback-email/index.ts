/// <reference path="../_shared/deno.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface FeedbackRequest {
  feedbackType: string;
  feedbackText: string;
  mediaUrls: string[];
  userEmail: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { feedbackType, feedbackText, mediaUrls, userEmail }: FeedbackRequest = await req.json();

    // Get Resend API key from environment
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const recipientEmail = Deno.env.get("FEEDBACK_RECIPIENT_EMAIL") || "your-email@example.com";

    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      // Still save to database even if email fails
      return new Response(
        JSON.stringify({
          success: true,
          message: "Feedback saved but email notification failed - API key not configured"
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Format media URLs as HTML links
    const mediaHtml = mediaUrls.length > 0
      ? `
        <h3>Attached Media:</h3>
        <ul>
          ${mediaUrls.map(url => `<li><a href="${url}">${url}</a></li>`).join('')}
        </ul>
      `
      : '';

    // Send email via Resend
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "noreply@your-domain.com",
        to: [recipientEmail],
        subject: `New ${feedbackType === 'feedback' ? 'Feedback' : 'Suggestion'} from ${userEmail}`,
        html: `
          <h2>New ${feedbackType === 'feedback' ? 'Feedback' : 'Suggestion'} Received</h2>
          <p><strong>From:</strong> ${userEmail}</p>
          <p><strong>Type:</strong> ${feedbackType}</p>
          <h3>Message:</h3>
          <p>${feedbackText.replace(/\n/g, '<br>')}</p>
          ${mediaHtml}
          <hr>
          <p style="color: #666; font-size: 12px;">Submitted at: ${new Date().toLocaleString()}</p>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("Resend API error:", errorText);
      throw new Error(`Failed to send email: ${errorText}`);
    }

    const emailResult = await emailResponse.json();
    console.log("Email sent successfully:", emailResult);

    return new Response(
      JSON.stringify({ success: true, message: "Feedback submitted and email sent successfully" }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error in send-feedback-email:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred"
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
