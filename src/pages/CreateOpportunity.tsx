import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { z } from 'zod';
import { ArrowLeft } from 'lucide-react';
import type { Client } from '@/types/database';

const opportunitySchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters').max(120),
  client: z.string().min(3, 'Client name must be at least 3 characters').max(120),
  responsible: z.string().min(3, 'Responsible name must be at least 3 characters').max(120),
  creationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
});

export default function CreateOpportunity() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [existingClients, setExistingClients] = useState<Client[]>([]);
  const [existingResponsibles, setExistingResponsibles] = useState<string[]>([]);
  
  const [formData, setFormData] = useState({
    name: '',
    client: '',
    responsible: '',
    creationDate: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    fetchClients();
    fetchResponsibles();
  }, []);

  const fetchClients = async () => {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error fetching clients:', error);
      return;
    }

    setExistingClients(data || []);
  };

  const fetchResponsibles = async () => {
    const { data, error } = await supabase
      .from('opportunities')
      .select('responsible_name')
      .not('responsible_name', 'is', null)
      .order('responsible_name');

    if (error) {
      console.error('Error fetching responsibles:', error);
      return;
    }

    // Get unique responsible names
    const uniqueNames = [...new Set(data.map(item => item.responsible_name).filter(Boolean))] as string[];
    setExistingResponsibles(uniqueNames);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setLoading(true);

    try {
      // Validate form data
      opportunitySchema.parse(formData);

      // First, ensure client exists or create it
      let clientId: number;
      const existingClient = existingClients.find(
        (c) => c.name.toLowerCase() === formData.client.toLowerCase()
      );

      if (existingClient) {
        clientId = existingClient.id;
      } else {
        const { data: newClient, error: clientError } = await supabase
          .from('clients')
          .insert({ name: formData.client.trim() })
          .select()
          .single();

        if (clientError) throw clientError;
        clientId = newClient.id;
      }

      // Create opportunity
      const { error: oppError } = await supabase
        .from('opportunities')
        .insert({
          name: formData.name.trim(),
          client_id: clientId,
          responsible_name: formData.responsible.trim(),
          creation_date: formData.creationDate,
          created_by: user.id,
        });

      if (oppError) throw oppError;

      toast.success('Opportunity created successfully!');
      navigate('/opportunities');
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        error.errors.forEach((err) => {
          toast.error(err.message);
        });
      } else {
        toast.error(error.message || 'Failed to create opportunity');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          className="mb-6 gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Button>

        <Card className="mx-auto max-w-2xl shadow-card">
          <CardHeader>
            <CardTitle className="text-3xl">Create New Opportunity</CardTitle>
            <CardDescription>
              Fill in the details to create a new sales opportunity
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Opportunity Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter opportunity name"
                  required
                  maxLength={120}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="client">Client *</Label>
                <Input
                  id="client"
                  value={formData.client}
                  onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                  placeholder="Enter client name"
                  list="clients-list"
                  required
                  maxLength={120}
                />
                <datalist id="clients-list">
                  {existingClients.map((client) => (
                    <option key={client.id} value={client.name} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-2">
                <Label htmlFor="responsible">Responsible *</Label>
                <Input
                  id="responsible"
                  value={formData.responsible}
                  onChange={(e) => setFormData({ ...formData, responsible: e.target.value })}
                  placeholder="Enter responsible person name"
                  list="responsibles-list"
                  required
                  maxLength={120}
                />
                <datalist id="responsibles-list">
                  {existingResponsibles.map((name, index) => (
                    <option key={index} value={name} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-2">
                <Label htmlFor="creationDate">Creation Date</Label>
                <Input
                  id="creationDate"
                  type="date"
                  value={formData.creationDate}
                  onChange={(e) => setFormData({ ...formData, creationDate: e.target.value })}
                  required
                />
              </div>

              <div className="flex gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/')}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="flex-1"
                >
                  {loading ? 'Creating...' : 'Create Opportunity'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
