import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleCorsPreflight } from '../_shared/cors.ts';
import { jsonResponse, errorResponse, successResponse } from '../_shared/response.ts';
import { validateMethod, parseJsonBody, validateRequiredFields, validateNonEmptyString } from '../_shared/validation.ts';

interface FeedbackRequest {
  feedbackType: string;
  feedbackText: string;
  mediaUrls: string[];
  userEmail: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return handleCorsPreflight();
  }

  const methodError = validateMethod(req, ['POST']);
  if (methodError) {
    return methodError;
  }

  try {
    const bodyResult = await parseJsonBody<FeedbackRequest>(req);
    if (bodyResult.error) {
      return bodyResult.error;
    }

    const { feedbackType, feedbackText, mediaUrls, userEmail } = bodyResult.data;

    const missingFields = validateRequiredFields(
      { feedbackType, feedbackText, userEmail },
      ['feedbackType', 'feedbackText', 'userEmail']
    );
    if (missingFields) {
      return errorResponse(missingFields, 400);
    }

    const textError = validateNonEmptyString(feedbackText, 'feedbackText');
    if (textError) {
      return errorResponse(textError, 400);
    }

    const emailError = validateNonEmptyString(userEmail, 'userEmail');
    if (emailError) {
      return errorResponse(emailError, 400);
    }

    // Get Resend API key from environment
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const recipientEmail = Deno.env.get("FEEDBACK_RECIPIENT_EMAIL") || "your-email@example.com";

    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      // Still save to database even if email fails
      return successResponse({ 
        message: "Feedback saved but email notification failed - API key not configured" 
      });
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

    return successResponse({ message: "Feedback submitted and email sent successfully" });
  } catch (error) {
    console.error("Error in send-feedback-email:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error occurred",
      500
    );
  }
});