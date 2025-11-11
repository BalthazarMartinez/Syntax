import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Search, ArrowUpDown } from 'lucide-react';
import type { Opportunity, InputFile, ArtifactDoc } from '@/types/database';

export default function Opportunities() {
  const navigate = useNavigate();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [inputCounts, setInputCounts] = useState<Record<number, number>>({});
  const [artifactCounts, setArtifactCounts] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState<keyof Opportunity>('creation_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetchOpportunities();
  }, []);

  const fetchOpportunities = async () => {
    setLoading(true);

    const { data: opps, error } = await supabase
      .from('opportunities')
      .select(`
        *,
        client:clients(name),
        responsible:profiles!opportunities_responsible_user_id_fkey(full_name)
      `)
      .is('deleted_at', null)
      .order('creation_date', { ascending: false });

    if (error) {
      console.error('Error fetching opportunities:', error);
      setLoading(false);
      return;
    }

    setOpportunities(opps || []);

    // Fetch counts
    const oppIds = opps?.map((o) => o.id) || [];
    
    const { data: inputs } = await supabase
      .from('inputs')
      .select('opportunity_id, id')
      .in('opportunity_id', oppIds);

    const { data: artifacts } = await supabase
      .from('artifacts')
      .select('opportunity_id, id')
      .in('opportunity_id', oppIds);

    // Count inputs per opportunity
    const inputMap: Record<number, number> = {};
    inputs?.forEach((input) => {
      inputMap[input.opportunity_id] = (inputMap[input.opportunity_id] || 0) + 1;
    });
    setInputCounts(inputMap);

    // Count artifacts per opportunity
    const artifactMap: Record<number, number> = {};
    artifacts?.forEach((artifact) => {
      artifactMap[artifact.opportunity_id] = (artifactMap[artifact.opportunity_id] || 0) + 1;
    });
    setArtifactCounts(artifactMap);

    setLoading(false);
  };

  const handleSort = (column: keyof Opportunity) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const filteredOpportunities = opportunities
    .filter((opp) => {
      const searchLower = searchTerm.toLowerCase();
      const responsibleName = opp.responsible_name || opp.responsible?.full_name || '';
      return (
        opp.name.toLowerCase().includes(searchLower) ||
        opp.client?.name.toLowerCase().includes(searchLower) ||
        responsibleName.toLowerCase().includes(searchLower)
      );
    })
    .sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      
      if (aVal === bVal) return 0;
      
      const comparison = aVal < bVal ? -1 : 1;
      return sortDirection === 'asc' ? comparison : -comparison;
    });

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
          
          <Button onClick={() => navigate('/opportunities/new')}>
            Create New
          </Button>
        </div>

        <Card className="p-6 shadow-card">
          <div className="mb-6">
            <h1 className="mb-2 text-3xl font-bold">Opportunities</h1>
            <p className="text-muted-foreground">
              View and manage all your opportunities
            </p>
          </div>

          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search opportunities, clients, or responsible..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : filteredOpportunities.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center">
              <p className="text-lg font-medium">No opportunities found</p>
              <p className="text-sm text-muted-foreground">
                {searchTerm ? 'Try adjusting your search' : 'Create your first opportunity to get started'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('id')}>
                      <div className="flex items-center gap-2">
                        ID <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('name')}>
                      <div className="flex items-center gap-2">
                        Name <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Responsible</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('creation_date')}>
                      <div className="flex items-center gap-2">
                        Creation Date <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead className="text-center">Inputs</TableHead>
                    <TableHead className="text-center">Artifacts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOpportunities.map((opp) => (
                    <TableRow
                      key={opp.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/opportunities/${opp.id}`)}
                    >
                      <TableCell className="font-medium">{opp.id}</TableCell>
                      <TableCell>{opp.name}</TableCell>
                      <TableCell>{opp.client?.name || 'N/A'}</TableCell>
                      <TableCell>{opp.responsible_name || opp.responsible?.full_name || 'N/A'}</TableCell>
                      <TableCell>{new Date(opp.creation_date).toLocaleDateString()}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">
                          {inputCounts[opp.id] || 0} PDFs
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">
                          {artifactCounts[opp.id] || 0} Docs
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
