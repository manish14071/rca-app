"use client";
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardHeader, CardContent } from '@/components/ui/card.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient.ts';

export default function VerifyEmail() {
  const [location, navigate] = useLocation();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const token = new URLSearchParams(window.location.search).get('token');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }

    const verifyEmail = async () => {
      try {
        await apiRequest('POST', '/api/auth/verify-email', { token });
        setStatus('success');
      } catch (error) {
        console.error('Email verification failed:', error);
        setStatus('error');
      }
    };

    verifyEmail();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-[400px]">
        <CardHeader className="text-2xl font-bold text-center">
          Email Verification
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-4">
          {status === 'loading' && (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p>Verifying your email address...</p>
            </>
          )}
          {status === 'success' && (
            <>
              <CheckCircle className="h-8 w-8 text-green-500" />
              <p>Email verified successfully!</p>
              <Button onClick={() => navigate('/auth')}>
                Continue to Login
              </Button>
            </>
          )}
          {status === 'error' && (
            <>
              <XCircle className="h-8 w-8 text-destructive" />
              <p>Verification failed. The link may be invalid or expired.</p>
              <Button onClick={() => navigate('/auth')}>
                Back to Login
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
