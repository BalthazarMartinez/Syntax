import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { ArrowLeft, Upload, FileText, Sparkles, ExternalLink, Trash2, RotateCw, CheckCircle, AlertCircle, Clock, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<InputFile | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [retryDialogOpen, setRetryDialogOpen] = useState(false);
  const [fileToRetry, setFileToRetry] = useState<InputFile | null>(null);
  const [retryFile, setRetryFile] = useState<File | null>(null);
  const [deleteArtifactDialogOpen, setDeleteArtifactDialogOpen] = useState(false);
  const [artifactToDelete, setArtifactToDelete] = useState<ArtifactDoc | null>(null);
  const [deleteArtifactLoading, setDeleteArtifactLoading] = useState(false);

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
          gdrive_file_name: 'pending',
          gdrive_web_url: 'pending',
          uploaded_by: user.id,
        } as any)
        .select()
        .single();

      if (insertError) throw insertError;

      // Prepare FormData for backend function
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('input_id', inputRecord.id.toString());
      formData.append('opportunity_id', opportunityId.toString());
      formData.append('file_name', fileName);
      formData.append('uploaded_by', user.id);

      // Call edge function proxy (secure)
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        throw new Error('Authentication required');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy_n8n_upload`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.session.access_token}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Upload failed: ${response.status}`);
      }

      const data = await response.json();

      const { gdrive_file_name, gdrive_web_url } = data;

      if (!gdrive_file_name || !gdrive_web_url) {
        throw new Error('Upload response missing required fields');
      }

      // Update database with Google Drive URLs
      const { error: updateError } = await supabase
        .from('inputs')
        .update({
          gdrive_file_name,
          gdrive_web_url,
          upload_status: 'completed',
          error_message: null,
        })
        .eq('id', inputRecord.id);

      if (updateError) {
        throw updateError;
      }

      toast.success('Document uploaded successfully!');
      setUploadDialogOpen(false);
      setUploadFileName('');
      setSelectedFile(null);
      fetchOpportunityDetails();
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload document');
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
          gdrive_file_name: mockGDriveId,
          gdrive_web_url: mockGDriveUrl,
          generated_by: user.id,
        } as any);

      if (error) throw error;

      toast.success('Artifact generated successfully!');
      fetchOpportunityDetails();
    } catch (error: any) {
      toast.error(error.message || 'Failed to generate artifact');
    }
  };

  const handleDeleteFile = async () => {
    if (!fileToDelete) return;

    setDeleteLoading(true);
    try {
      const { error } = await supabase
        .from('inputs')
        .delete()
        .eq('id', fileToDelete.id);

      if (error) throw error;

      toast.success('File deleted successfully.');
      setDeleteDialogOpen(false);
      setFileToDelete(null);
      await fetchOpportunityDetails();
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete file.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteArtifact = async () => {
    if (!artifactToDelete) return;

    setDeleteArtifactLoading(true);
    try {
      const { error } = await supabase
        .from('artifacts')
        .delete()
        .eq('id', artifactToDelete.id);

      if (error) throw error;

      toast.success('Artifact deleted successfully.');
      setDeleteArtifactDialogOpen(false);
      setArtifactToDelete(null);
      await fetchOpportunityDetails();
    } catch (error) {
      console.error('Delete artifact error:', error);
      toast.error('Failed to delete artifact.');
    } finally {
      setDeleteArtifactLoading(false);
    }
  };

  const handleRetryUpload = async () => {
    if (!retryFile || !fileToRetry || !user || !id) {
      toast.error('Please select a file to upload');
      return;
    }

    const opportunityId = parseInt(id);
    if (isNaN(opportunityId)) return;

    setUploadLoading(true);

    try {
      // Update record to processing status
      const { error: updateError } = await supabase
        .from('inputs')
        .update({
          file_name: retryFile.name,
          file_size: retryFile.size,
          mime_type: retryFile.type,
          upload_status: 'processing',
          error_message: null,
        })
        .eq('id', fileToRetry.id);

      if (updateError) throw updateError;

      console.log(`[Retry] Retrying upload for input_id: ${fileToRetry.id}`);

      // Prepare FormData for backend function
      const formData = new FormData();
      formData.append('file', retryFile);
      formData.append('input_id', fileToRetry.id.toString());
      formData.append('opportunity_id', opportunityId.toString());
      formData.append('file_name', retryFile.name);
      formData.append('uploaded_by', user.id);

      // Call n8n webhook directly
      const n8nResponse = await fetch('https://n8n.srv1076252.hstgr.cloud/webhook/syntax-inputs', {
        method: 'POST',
        body: formData,
      });

      if (!n8nResponse.ok) {
        const errorText = await n8nResponse.text();
        console.error('[Retry] n8n webhook error:', errorText);
        throw new Error(`Upload failed: ${n8nResponse.status} ${errorText}`);
      }

      const data = await n8nResponse.json();
      console.log('[Retry] Upload successful:', data);

      const { gdrive_file_name, gdrive_web_url } = data;

      if (!gdrive_file_name || !gdrive_web_url) {
        throw new Error('Upload response missing required fields');
      }

      // Update database with Google Drive URLs
      const { error: finalUpdateError } = await supabase
        .from('inputs')
        .update({
          gdrive_file_name,
          gdrive_web_url,
          upload_status: 'completed',
          error_message: null,
        })
        .eq('id', fileToRetry.id);

      if (finalUpdateError) {
        console.error('[Retry] Database update error:', finalUpdateError);
        throw finalUpdateError;
      }

      toast.success('File uploaded successfully!');
      setRetryDialogOpen(false);
      setRetryFile(null);
      setFileToRetry(null);
      fetchOpportunityDetails();
    } catch (error: any) {
      console.error('[Retry] Error:', error);
      
      // Update record with failed status
      await supabase
        .from('inputs')
        .update({
          upload_status: 'failed',
          error_message: error.message || 'Failed to upload file to Google Drive',
        })
        .eq('id', fileToRetry.id);

      toast.error(error.message || 'Failed to upload file');
      fetchOpportunityDetails();
    } finally {
      setUploadLoading(false);
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
                  {inputs.map((input) => {
                    const isCompleted = input.upload_status === 'completed';
                    const isFailed = input.upload_status === 'failed';
                    const isProcessing = input.upload_status === 'processing';

                    return (
                      <div
                        key={input.id}
                        className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <div className="flex-shrink-0">
                            {isCompleted && <CheckCircle className="h-5 w-5 text-green-500" />}
                            {isFailed && <AlertCircle className="h-5 w-5 text-destructive" />}
                            {isProcessing && <Clock className="h-5 w-5 text-yellow-500 animate-pulse" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium truncate">{input.file_name}</p>
                              {isCompleted && (
                                <Badge className="bg-green-500 hover:bg-green-600 text-white">Completed</Badge>
                              )}
                              {isFailed && <Badge variant="destructive">Failed</Badge>}
                              {isProcessing && (
                                <Badge className="bg-yellow-500 hover:bg-yellow-600 text-yellow-950">Processing</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {input.file_size && `${(input.file_size / 1024).toFixed(2)} KB • `}
                              {new Date(input.uploaded_at).toLocaleString()}
                            </p>
                            {isFailed && input.error_message && (
                              <p className="text-xs text-destructive mt-1">{input.error_message}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {isFailed && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setFileToRetry(input);
                                setRetryDialogOpen(true);
                              }}
                              disabled={uploadLoading}
                              className="hover:bg-primary/10 hover:text-primary"
                              title="Retry upload"
                            >
                              <RotateCw className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => window.open(input.gdrive_web_url, '_blank')}
                            disabled={!isCompleted || !input.gdrive_web_url || input.gdrive_web_url === 'pending'}
                            title={isCompleted && input.gdrive_web_url && input.gdrive_web_url !== 'pending' ? "View in Google Drive" : "File not yet available"}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setFileToDelete(input);
                              setDeleteDialogOpen(true);
                            }}
                            disabled={deleteLoading}
                            className="hover:bg-destructive/10 hover:text-destructive"
                            title="Delete file"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
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
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => window.open(artifact.gdrive_web_url, '_blank')}
                          title="View in Google Drive"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setArtifactToDelete(artifact);
                            setDeleteArtifactDialogOpen(true);
                          }}
                          disabled={deleteArtifactLoading}
                          className="hover:bg-destructive/10 hover:text-destructive"
                          title="Delete artifact"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this file? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteFile}
              disabled={deleteLoading}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteLoading ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Artifact Confirmation Dialog */}
      <AlertDialog open={deleteArtifactDialogOpen} onOpenChange={setDeleteArtifactDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Artifact</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this artifact? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteArtifactLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteArtifact}
              disabled={deleteArtifactLoading}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteArtifactLoading ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Retry Upload Dialog */}
      <Dialog open={retryDialogOpen} onOpenChange={setRetryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retry File Upload</DialogTitle>
            <DialogDescription>
              Select a new file to retry uploading for: {fileToRetry?.file_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="retry-file">Select PDF File</Label>
              <Input
                id="retry-file"
                type="file"
                accept=".pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (file.type !== 'application/pdf') {
                      toast.error('Please select a PDF file');
                      return;
                    }
                    if (file.size > 10 * 1024 * 1024) {
                      toast.error('File size must be less than 10MB');
                      return;
                    }
                    setRetryFile(file);
                  }
                }}
                disabled={uploadLoading}
              />
              {retryFile && (
                <p className="text-sm text-muted-foreground mt-2">
                  Selected: {retryFile.name} ({(retryFile.size / 1024).toFixed(2)} KB)
                </p>
              )}
            </div>
            {fileToRetry?.error_message && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <p className="text-sm text-destructive font-medium">Previous Error:</p>
                <p className="text-sm text-destructive/80 mt-1">{fileToRetry.error_message}</p>
              </div>
            )}
            <Button
              onClick={handleRetryUpload}
              disabled={uploadLoading || !retryFile}
              className="w-full"
            >
              {uploadLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <RotateCw className="mr-2 h-4 w-4" />
                  Retry Upload
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
