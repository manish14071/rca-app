import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardHeader, CardContent } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { insertUserSchema } from "@shared/schema.ts";
import { apiRequest } from "@/lib/queryClient.ts";
import { useToast } from "@/hooks/use-toast.ts";
import { OAuth2Client } from "google-auth-library";

interface GoogleResponse {
  credential: string;
  select_by: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          renderButton: (element: HTMLElement, config: any) => void;
          prompt: () => void;
        };
      };
    };
  }
}

export default function AuthPage() {
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [authCheckCompleted, setAuthCheckCompleted] = useState(false);

  useEffect(() => {
    const checkExistingAuth = async () => {
      const userId = localStorage.getItem('userId');
      if (userId) {
        try {
          const response = await apiRequest('GET', `/api/users/${userId}`);
          const user = await response.json();
          
          if (user.googleId) {
            navigate('/chat');
            return;
          }
        } catch (error) {
          console.log('Session validation error:', error);
          localStorage.removeItem('userId');
        }
      }
      setAuthCheckCompleted(true);
    };
  
    checkExistingAuth();
  }, [navigate]);

  const form = useForm({
    resolver: zodResolver(insertUserSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (type: "login" | "register") => {
    try {
      setIsLoading(true);
      const response = await apiRequest(
        "POST",
        `/api/auth/${type}`,
        form.getValues()
      );
      const data = await response.json();

      if (response.ok) {
        if (type === "register") {
          toast({
            title: "Registration Successful",
            description: "Please check your email for verification instructions.",
            variant: "default",
          });
          navigate("/verify-email");
          return;
        }

        if (data.error === "Email not verified") {
          toast({
            title: "Verify Your Email",
            description: "Please check your email for the verification link.",
            variant: "default",
          });
          return;
        }

        localStorage.setItem("userId", data.id.toString());
        navigate("/chat");
      } else {
        throw new Error(data.error || "Authentication failed");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Authentication failed",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!authCheckCompleted) return;

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;

    script.onload = () => {
      window.google?.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: async (response: GoogleResponse) => {
          try {
            const res = await apiRequest("POST", "/api/auth/google", {
              credential: response.credential,
            });
            const data = await res.json();
            localStorage.setItem("userId", data.id.toString());
            navigate("/chat");
          } catch (error: any) {
            toast({
              title: "Error",
              description: error.message || "Google authentication failed",
              variant: "destructive",
            });
          }
        },
        auto_select: true,
      });

      if (googleButtonRef.current) {
        window.google?.accounts.id.renderButton(googleButtonRef.current, {
          theme: "outline",
          size: "large",
          width: "100%",
        });
      }
    };

    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
    };
  }, [navigate, toast, authCheckCompleted]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-[400px]">
        <CardHeader className="text-2xl font-bold text-center">
          Chat App
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>

            <Form {...form}>
              <form className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <TabsContent value="login">
                  <Button
                    className="w-full"
                    disabled={isLoading}
                    onClick={() => onSubmit("login")}
                  >
                    Login
                  </Button>
                </TabsContent>

                <TabsContent value="register">
                  <Button
                    className="w-full"
                    disabled={isLoading}
                    onClick={() => onSubmit("register")}
                  >
                    Register
                  </Button>
                </TabsContent>

                {authCheckCompleted && (
                  <>
                    <div className="relative my-4">
                      <Separator />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="bg-background px-2 text-muted-foreground">
                          Or continue with
                        </span>
                      </div>
                    </div>

                    <div
                      ref={googleButtonRef}
                      id="googleButton"
                      className="w-full mt-4 flex justify-center"
                    />
                  </>
                )}
              </form>
            </Form>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}