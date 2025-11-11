import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import logo from '@/assets/logo.png';

export function Header() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container flex h-16 items-center justify-between px-4">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-3 transition-opacity hover:opacity-80"
        >
          <img src={logo} alt="Syntax.AI" className="h-10 w-10" />
          <span className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Syntax.AI
          </span>
        </button>
        
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            hello, <span className="font-medium text-foreground">{profile?.full_name || 'User'}</span>
          </span>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleSignOut}
            className="gap-2"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
}
