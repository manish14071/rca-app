import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button.tsx';
import { ArrowRight, MessageSquare, Lock, Users } from 'lucide-react';

export default function LandingPage() {
  const [_, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-accent/10">
      <div className="container mx-auto px-4 py-16">
        <nav className="flex justify-between items-center mb-16">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            ChatApp
          </h1>
          <Button variant="ghost" onClick={() => navigate('/auth')}>
            Sign In
          </Button>
        </nav>

        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <h2 className="text-4xl sm:text-5xl font-bold leading-tight">
              Connect and Chat in{' '}
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                Real-Time
              </span>
            </h2>
            <p className="text-xl text-muted-foreground">
              Experience seamless communication with our modern chat platform.
              Connect with friends, share media, and stay in touch - all in one place.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" onClick={() => navigate('/auth')} className="gap-2">
                Get Started <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate('/auth?tab=register')}>
                Create Account
              </Button>
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            <div className="p-6 bg-card rounded-lg shadow-lg">
              <MessageSquare className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2">Real-Time Chat</h3>
              <p className="text-muted-foreground">
                Instant message delivery with typing indicators and read receipts.
              </p>
            </div>
            <div className="p-6 bg-card rounded-lg shadow-lg lg:mt-8">
              <Lock className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2">Secure</h3>
              <p className="text-muted-foreground">
                End-to-end encryption keeps your conversations private and secure.
              </p>
            </div>
            <div className="p-6 bg-card rounded-lg shadow-lg">
              <Users className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2">Group Chats</h3>
              <p className="text-muted-foreground">
                Create groups for team collaboration or friend circles.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
