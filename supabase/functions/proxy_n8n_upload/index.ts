import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Validation schema for webhook response
const webhookResponseSchema = z.object({
  gdrive_file_name: z.string()
    .min(1, 'File name cannot be empty')
    .max(255, 'File name too long')
    .regex(/^[^<>:"|?*\\]+$/, 'Invalid characters in file name'),
  gdrive_web_url: z.string()
    .url('Invalid URL format')
    .startsWith('https://drive.google.com/', 'Must be a Google Drive URL')
    .max(500, 'URL too long')
});

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 200,
      headers: corsHeaders 
    });
  }

  try {
    // Validate webhook URL is configured
    const n8nUrl = Deno.env.get('VITE_N8N_WEBHOOK_URL');
    if (!n8nUrl) {
      console.error('VITE_N8N_WEBHOOK_URL not configured in environment');
      return jsonResponse(500, { 
        error: 'N8N webhook URL not configured' 
      });
    }

    // Parse incoming FormData
    const formIn = await req.formData();
    
    // Extract and validate file
    const file = formIn.get('file') as File | null;
    if (!file) {
      return jsonResponse(400, { error: 'file is required' });
    }

    // Validate file type
    if (file.type !== 'application/pdf') {
      return jsonResponse(400, { 
        error: 'only PDF files are allowed',
        received_type: file.type 
      });
    }

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return jsonResponse(413, { 
        error: 'file too large',
        max_size: maxSize,
        received_size: file.size
      });
    }

    // Extract metadata
    const inputId = formIn.get('input_id') as string || '';
    const opportunityId = formIn.get('opportunity_id') as string || '';
    const fileName = formIn.get('file_name') as string || file.name;
    const uploadedBy = formIn.get('uploaded_by') as string || '';

    // Construct FormData for n8n
    const formOut = new FormData();
    formOut.append('file', file, fileName);
    formOut.append('input_id', inputId);
    formOut.append('id_opp', opportunityId);
    formOut.append('file_name', fileName);
    formOut.append('uploaded_by', uploadedBy);

    // Setup timeout (25 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 25000);

    // Call n8n webhook
    let n8nResponse: Response;
    try {
      n8nResponse = await fetch(n8nUrl, {
        method: 'POST',
        body: formOut,
        signal: controller.signal,
      });
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        return jsonResponse(504, { 
          error: 'Request to n8n timed out',
          detail: 'The upload took too long to complete'
        });
      }
      
      return jsonResponse(500, {
        error: 'Failed to connect to n8n webhook',
        detail: String(fetchError.message || fetchError)
      });
    }

    clearTimeout(timeoutId);

    // Read response
    const responseText = await n8nResponse.text();

    // Handle n8n error
    if (!n8nResponse.ok) {
      return jsonResponse(n8nResponse.status, {
        error: 'n8n webhook returned error',
        status: n8nResponse.status,
        detail: responseText.substring(0, 200)
      });
    }

    // Parse JSON response
    let n8nData: any;
    try {
      n8nData = JSON.parse(responseText);
    } catch (parseError) {
      return jsonResponse(500, { 
        error: 'Invalid JSON response from n8n',
        detail: 'n8n did not return valid JSON'
      });
    }

    // Validate response using Zod schema
    try {
      const validatedData = webhookResponseSchema.parse(n8nData);
      
      // Return validated response
      return jsonResponse(200, {
        success: true,
        gdrive_file_name: validatedData.gdrive_file_name,
        gdrive_web_url: validatedData.gdrive_web_url
      });
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        return jsonResponse(400, {
          error: 'Invalid webhook response format',
          detail: validationError.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
        });
      }
      throw validationError;
    }

  } catch (error: any) {
    return jsonResponse(500, {
      error: 'Internal server error',
      detail: String(error.message || error)
    });
  }
});

// Helper function for JSON responses with CORS
function jsonResponse(status: number, body: any) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}
