import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { ArrowLeft, Upload, FileText, Sparkles, ExternalLink, Trash2 } from 'lucide-react';
import type { Opportunity, InputFile, ArtifactDoc } from '@/types/database';

export default function OpportunityDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [inputs, setInputs] = useState<InputFile[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadFileName, setUploadFileName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    if (id) {
      fetchOpportunityDetails();
    }
  }, [id]);

  const fetchOpportunityDetails = async () => {
    if (!id) return;
    
    const opportunityId = parseInt(id);
    if (isNaN(opportunityId)) {
      toast.error('Invalid opportunity ID');
      navigate('/opportunities');
      return;
    }
    
    setLoading(true);

    const { data: opp, error: oppError } = await supabase
      .from('opportunities')
      .select(`
        *,
        client:clients(name),
        responsible:profiles!opportunities_responsible_user_id_fkey(full_name)
      `)
      .eq('id', opportunityId)
      .maybeSingle();

    if (oppError) {
      console.error('Error fetching opportunity:', oppError);
      toast.error('Failed to load opportunity');
      navigate('/opportunities');
      return;
    }

    if (!opp) {
      toast.error('Opportunity not found');
      navigate('/opportunities');
      return;
    }

    setOpportunity(opp as Opportunity);

    // Fetch inputs
    const { data: inputsData } = await supabase
      .from('inputs')
      .select('*')
      .eq('opportunity_id', opportunityId)
      .order('uploaded_at', { ascending: false });

    setInputs(inputsData || []);

    // Fetch artifacts
    const { data: artifactsData } = await supabase
      .from('artifacts')
      .select('*')
      .eq('opportunity_id', opportunityId)
      .order('generated_at', { ascending: false });

    setArtifacts(artifactsData || []);
    setLoading(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        toast.error('Please upload a PDF file');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File size must be less than 10MB');
        return;
      }
      setSelectedFile(file);
      if (!uploadFileName) {
        setUploadFileName(file.name);
      }
    }
  };

  const handleUploadInput = async () => {
    if (!user || !id || !selectedFile) {
      toast.error('Please select a file to upload');
      return;
    }

    const opportunityId = parseInt(id);
    if (isNaN(opportunityId)) return;

    setUploadLoading(true);

    try {
      const fileName = uploadFileName.trim() || selectedFile.name;
      
      // Create pending record in database
      const { data: inputRecord, error: insertError } = await supabase
        .from('inputs')
        .insert({
          opportunity_id: opportunityId,
          file_name: fileName,
          file_size: selectedFile.size,
          mime_type: selectedFile.type,
          upload_status: 'processing',
          gdrive_file_id: 'pending',
          gdrive_web_url: 'pending',
          uploaded_by: user.id,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Upload file to n8n webhook
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('id_opp', opportunityId.toString());
      formData.append('file_name', fileName);
      formData.append('uploaded_by', user.id);
      formData.append('input_id', inputRecord.id.toString());

      const webhookUrl = import.meta.env.VITE_N8N_WEBHOOK_URL;
      if (!webhookUrl) {
        throw new Error('N8N webhook URL not configured');
      }

      const response = await fetch(webhookUrl, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      const { gdrive_file_id, gdrive_web_url } = result;

      // Update database with Google Drive URLs
      const { error: updateError } = await supabase
        .from('inputs')
        .update({
          gdrive_file_id,
          gdrive_web_url,
          upload_status: 'completed',
        })
        .eq('id', inputRecord.id);

      if (updateError) throw updateError;

      toast.success('Document uploaded successfully!');
      setUploadDialogOpen(false);
      setUploadFileName('');
      setSelectedFile(null);
      fetchOpportunityDetails();
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload document');
      console.error('Upload error:', error);
    } finally {
      setUploadLoading(false);
    }
  };

  const handleGenerateArtifact = async () => {
    if (!user || !id) return;

    const opportunityId = parseInt(id);
    if (isNaN(opportunityId)) return;

    try {
      // Simulate artifact generation
      const mockGDriveId = `artifact-${Date.now()}`;
      const mockGDriveUrl = `https://docs.google.com/document/d/${mockGDriveId}/edit`;
      const fileName = `Artifact for ${opportunity?.name} - ${new Date().toLocaleDateString()}`;

      const { error } = await supabase
        .from('artifacts')
        .insert({
          opportunity_id: opportunityId,
          file_name: fileName,
          gdrive_file_id: mockGDriveId,
          gdrive_web_url: mockGDriveUrl,
          generated_by: user.id,
        });

      if (error) throw error;

      toast.success('Artifact generated successfully!');
      fetchOpportunityDetails();
    } catch (error: any) {
      toast.error(error.message || 'Failed to generate artifact');
    }
  };

  const handleDeleteOpportunity = async () => {
    if (!id || !window.confirm('Are you sure you want to delete this opportunity?')) return;

    const opportunityId = parseInt(id);
    if (isNaN(opportunityId)) return;

    try {
      const { error } = await supabase
        .from('opportunities')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', opportunityId);

      if (error) throw error;

      toast.success('Opportunity deleted successfully');
      navigate('/opportunities');
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete opportunity');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!opportunity) return null;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <Button
          variant="ghost"
          onClick={() => navigate('/opportunities')}
          className="mb-6 gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Opportunities
        </Button>

        {/* Opportunity Summary */}
        <Card className="mb-6 shadow-card">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-3xl">{opportunity.name}</CardTitle>
                <CardDescription className="mt-2 text-base">
                  ID: {opportunity.id} | Created: {new Date(opportunity.creation_date).toLocaleDateString()}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => navigate(`/opportunities/${id}/edit`)}
                >
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteOpportunity}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Client</p>
                <p className="text-lg">{opportunity.client?.name || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Responsible</p>
                <p className="text-lg">{opportunity.responsible_name || opportunity.responsible?.full_name || 'N/A'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Inputs Section */}
          <Card className="shadow-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Input Files (PDFs)
                  </CardTitle>
                  <CardDescription>Uploaded documents for this opportunity</CardDescription>
                </div>
                <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-2">
                      <Upload className="h-4 w-4" />
                      Upload
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Upload Input File</DialogTitle>
                      <DialogDescription>
                        Upload a PDF document to this opportunity
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="fileInput">Upload Document (PDF)</Label>
                        <Input
                          id="fileInput"
                          type="file"
                          accept=".pdf,application/pdf"
                          onChange={handleFileSelect}
                        />
                        {selectedFile && (
                          <p className="text-sm text-muted-foreground">
                            Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="fileName">Document Name (optional)</Label>
                        <Input
                          id="fileName"
                          placeholder="Leave empty to use file name"
                          value={uploadFileName}
                          onChange={(e) => setUploadFileName(e.target.value)}
                          maxLength={200}
                        />
                      </div>
                      <Button
                        onClick={handleUploadInput}
                        disabled={uploadLoading || !selectedFile}
                        className="w-full"
                      >
                        {uploadLoading ? (
                          <>
                            <span className="animate-spin mr-2">⏳</span>
                            Uploading to Google Drive...
                          </>
                        ) : (
                          'Upload Document'
                        )}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {inputs.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground">No input files yet</p>
              ) : (
                <div className="space-y-2">
                  {inputs.map((input) => (
                    <div
                      key={input.id}
                      className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex-1">
                        <p className="font-medium">{input.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(input.uploaded_at).toLocaleString()}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => window.open(input.gdrive_web_url, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Artifacts Section */}
          <Card className="shadow-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-accent" />
                    Artifacts (Docs)
                  </CardTitle>
                  <CardDescription>Generated documents from AI</CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleGenerateArtifact}
                  className="gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  Generate
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {artifacts.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground">No artifacts yet</p>
              ) : (
                <div className="space-y-2">
                  {artifacts.map((artifact) => (
                    <div
                      key={artifact.id}
                      className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex-1">
                        <p className="font-medium">{artifact.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(artifact.generated_at).toLocaleString()}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => window.open(artifact.gdrive_web_url, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
