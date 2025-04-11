import React, { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from '@/hooks/use-toast';
import { AlertCircle, Check } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// Define the form schema with Zod
const feedbackFormSchema = z.object({
  name: z.string().optional(),
  email: z.string().email({ message: "Please enter a valid email address" }).optional().or(z.literal('')),
  feedback: z.string().optional(),
  pmfScore: z.enum(['1', '2', '3', '4']).optional(),
  improvement: z.string().optional(),
});

type FeedbackFormValues = z.infer<typeof feedbackFormSchema>;

export function FeedbackForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Initialize the form
  const form = useForm<FeedbackFormValues>({
    resolver: zodResolver(feedbackFormSchema),
    defaultValues: {
      name: '',
      email: '',
      feedback: '',
      pmfScore: undefined,
      improvement: '',
    },
  });

  // Handle form submission
  async function onSubmit(data: FeedbackFormValues) {
    setIsSubmitting(true);
    
    try {
      // Send feedback data to the API
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: data.name || '',
          email: data.email || '',
          pmfScore: data.pmfScore || '',
          improvement: data.improvement || '',
          feedback: data.feedback || '',
        }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || 'Failed to submit feedback');
      }
      
      // Show success toast
      toast({
        title: "Feedback submitted",
        description: "Thank you for your feedback!",
      });
      
      // Reset form and show the thank you state
      form.reset();
      setSubmitted(true);
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast({
        variant: "destructive",
        title: "Submission failed",
        description: error instanceof Error 
          ? error.message 
          : "There was a problem submitting your feedback.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  // Handle the restart flow to submit more feedback
  const handleRestart = () => {
    setSubmitted(false);
  };

  // Show thank you screen after submission
  if (submitted) {
    return (
      <Card className="w-full border-neutral-200 bg-white">
        <CardHeader className="pb-4">
          <CardTitle className="text-center text-[#1A2942]">
            <div className="flex items-center justify-center">
              <div className="mr-2 h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="h-5 w-5 text-green-600" />
              </div>
              Thank You!
            </div>
          </CardTitle>
          <CardDescription className="text-center pt-2">
            Your feedback helps us improve the Margin of Safety Calculator.
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex justify-center pb-6">
          <Button variant="outline" onClick={handleRestart}>
            Submit Another Response
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full border-neutral-200 bg-white">
      <CardHeader className="pb-4">
        <CardTitle className="text-[#1A2942]">Share Your Feedback</CardTitle>
        <CardDescription>
          Help us improve the Margin of Safety Calculator by sharing your thoughts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-4">
              {/* Name Field - Optional */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Your name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Email Field - Optional */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="your.email@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Sean Ellis PMF Test Question */}
              <FormField
                control={form.control}
                name="pmfScore"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel>
                      How would you feel if you could no longer use the Margin of Safety Calculator?
                    </FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="flex flex-col space-y-1"
                      >
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl>
                            <RadioGroupItem value="1" />
                          </FormControl>
                          <FormLabel className="font-normal">
                            Very disappointed
                          </FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl>
                            <RadioGroupItem value="2" />
                          </FormControl>
                          <FormLabel className="font-normal">
                            Somewhat disappointed
                          </FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl>
                            <RadioGroupItem value="3" />
                          </FormControl>
                          <FormLabel className="font-normal">
                            Not disappointed
                          </FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl>
                            <RadioGroupItem value="4" />
                          </FormControl>
                          <FormLabel className="font-normal">
                            N/A - I don't use it
                          </FormLabel>
                        </FormItem>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Improvement Question */}
              <FormField
                control={form.control}
                name="improvement"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>How could we improve the calculator? (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Specific features, changes, or additions you'd like to see..."
                        className="min-h-[80px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* General Feedback */}
              <FormField
                control={form.control}
                name="feedback"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Additional Comments (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Any other thoughts or feedback you'd like to share..."
                        className="min-h-[80px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Alert variant="default" className="bg-blue-50 border-blue-100">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <AlertTitle className="text-blue-800">Note</AlertTitle>
              <AlertDescription className="text-blue-700 text-sm">
                Your feedback will help us prioritize future improvements to the calculator.
                All fields are optional.
              </AlertDescription>
            </Alert>

            <Button 
              type="submit" 
              className="w-full bg-[#1A2942] hover:bg-[#283c5f]" 
              disabled={isSubmitting}
            >
              {isSubmitting ? "Submitting..." : "Submit Feedback"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

export default FeedbackForm;