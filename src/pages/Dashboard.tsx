import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, FolderOpen } from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-5xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Syntax.AI
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Generative AI-powered assistant for artifact development and sales enablement at Santex Lab
          </p>
        </div>

        {/* Main CTAs */}
        <div className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-2">
          <Card 
            className="group cursor-pointer border-2 transition-all hover:border-primary hover:shadow-glow"
            onClick={() => navigate('/opportunities/new')}
          >
            <CardHeader>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-all group-hover:bg-primary group-hover:text-primary-foreground">
                <PlusCircle className="h-6 w-6" />
              </div>
              <CardTitle>Create New Opportunity</CardTitle>
              <CardDescription>
                Start a new sales opportunity and begin developing artifacts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full">
                Create Opportunity
              </Button>
            </CardContent>
          </Card>

          <Card 
            className="group cursor-pointer border-2 transition-all hover:border-accent hover:shadow-glow"
            onClick={() => navigate('/opportunities')}
          >
            <CardHeader>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent transition-all group-hover:bg-accent group-hover:text-accent-foreground">
                <FolderOpen className="h-6 w-6" />
              </div>
              <CardTitle>View Opportunities</CardTitle>
              <CardDescription>
                Browse and manage your existing opportunities and artifacts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" className="w-full">
                View All
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
