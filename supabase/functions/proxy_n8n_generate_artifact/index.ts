import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const requestSchema = z.object({
  opportunity_id: z.number().positive(),
  artifact_id: z.number().positive(),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const n8nWebhookUrl = Deno.env.get('VITE_N8N_GENERATE_ARTIFACT_WEBHOOK_URL');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    if (!n8nWebhookUrl) {
      throw new Error('N8N webhook URL not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the user is authenticated
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    console.log('[Generate Artifact] Request body:', { opportunity_id: body.opportunity_id, artifact_id: body.artifact_id });

    // Validate request body
    const validationResult = requestSchema.safeParse(body);
    if (!validationResult.success) {
      console.error('[Generate Artifact] Validation error:', validationResult.error);
      return new Response(
        JSON.stringify({ error: 'Invalid request data', details: validationResult.error.issues }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { opportunity_id, artifact_id } = validationResult.data;

    // Verify the artifact exists and belongs to the user's opportunity
    const { data: artifact, error: artifactError } = await supabase
      .from('artifacts')
      .select('*, opportunity:opportunities(created_by, responsible_user_id)')
      .eq('id', artifact_id)
      .eq('opportunity_id', opportunity_id)
      .single();

    if (artifactError || !artifact) {
      console.error('[Generate Artifact] Artifact not found:', artifactError);
      return new Response(
        JSON.stringify({ error: 'Artifact not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user has access to this opportunity
    const opportunity = artifact.opportunity as any;
    if (opportunity.created_by !== user.id && opportunity.responsible_user_id !== user.id) {
      console.error('[Generate Artifact] User does not have access to this opportunity');
      return new Response(
        JSON.stringify({ error: 'Unauthorized access to opportunity' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Generate Artifact] Calling n8n webhook:', n8nWebhookUrl);

    // Call the n8n webhook
    const n8nResponse = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        opportunity_id,
        artifact_id,
      }),
    });

    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text();
      console.error('[Generate Artifact] N8N webhook error:', errorText);
      throw new Error(`N8N webhook failed: ${errorText}`);
    }

    const n8nData = await n8nResponse.json();
    console.log('[Generate Artifact] N8N webhook response received');

    // Validate the webhook response
    const responseSchema = z.object({
      gdrive_file_name: z.string().min(1),
      gdrive_web_url: z.string().url(),
    });

    const responseValidation = responseSchema.safeParse(n8nData);
    if (!responseValidation.success) {
      console.error('[Generate Artifact] Invalid webhook response:', responseValidation.error);
      
      // Update artifact with error status
      await supabase
        .from('artifacts')
        .update({
          gdrive_file_name: 'error',
          gdrive_web_url: 'error'
        })
        .eq('id', artifact_id);

      return new Response(
        JSON.stringify({ error: 'Invalid webhook response format' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update the artifact with the actual Google Drive info
    const { error: updateError } = await supabase
      .from('artifacts')
      .update({
        gdrive_file_name: responseValidation.data.gdrive_file_name,
        gdrive_web_url: responseValidation.data.gdrive_web_url,
      })
      .eq('id', artifact_id);

    if (updateError) {
      console.error('[Generate Artifact] Failed to update artifact:', updateError);
      throw updateError;
    }

    console.log('[Generate Artifact] Artifact updated successfully');

    return new Response(
      JSON.stringify({
        success: true,
        artifact_id,
        gdrive_file_name: responseValidation.data.gdrive_file_name,
        gdrive_web_url: responseValidation.data.gdrive_web_url,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[Generate Artifact] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
