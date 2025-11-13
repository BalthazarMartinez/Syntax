import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
    const n8nUrl = Deno.env.get('N8N_WEBHOOK_URL');
    if (!n8nUrl) {
      console.error('N8N_WEBHOOK_URL not configured in environment');
      return jsonResponse(500, { 
        error: 'N8N webhook URL not configured' 
      });
    }

    console.log('[proxy_n8n_upload] Starting upload process');

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

    console.log(`[proxy_n8n_upload] Processing file: ${fileName}, input_id: ${inputId}`);

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
        console.error(`[proxy_n8n_upload] Timeout for input_id: ${inputId}`);
        return jsonResponse(504, { 
          error: 'Request to n8n timed out',
          detail: 'The upload took too long to complete'
        });
      }
      
      console.error(`[proxy_n8n_upload] Fetch error for input_id ${inputId}:`, fetchError);
      return jsonResponse(500, { 
        error: 'Failed to connect to n8n webhook',
        detail: String(fetchError.message || fetchError)
      });
    }

    clearTimeout(timeoutId);

    // Read response
    const responseText = await n8nResponse.text();
    console.log(`[proxy_n8n_upload] n8n status: ${n8nResponse.status} for input_id: ${inputId}`);

    // Handle n8n error
    if (!n8nResponse.ok) {
      console.error(`[proxy_n8n_upload] n8n error response:`, responseText);
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
      console.error(`[proxy_n8n_upload] Failed to parse n8n response:`, responseText);
      return jsonResponse(500, { 
        error: 'Invalid JSON response from n8n',
        detail: 'n8n did not return valid JSON'
      });
    }

    // Validate required fields
    if (!n8nData.gdrive_file_id || !n8nData.gdrive_web_url) {
      console.error(`[proxy_n8n_upload] Missing required fields in n8n response:`, n8nData);
      return jsonResponse(500, { 
        error: 'n8n response missing required fields',
        detail: 'Expected gdrive_file_id and gdrive_web_url',
        received: Object.keys(n8nData)
      });
    }

    console.log(`[proxy_n8n_upload] Success for input_id ${inputId}:`, {
      gdrive_file_id: n8nData.gdrive_file_id,
      gdrive_web_url: n8nData.gdrive_web_url
    });

    // Return successful response
    return jsonResponse(200, n8nData);

  } catch (error: any) {
    console.error('[proxy_n8n_upload] Unexpected error:', error);
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
