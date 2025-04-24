import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from '@/components/ui/card';
import { 
  Form, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormControl, 
  FormDescription, 
  FormMessage 
} from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { StyledInput } from '@/components/ui/styled-input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

// Feedback form schema
const feedbackFormSchema = z.object({
  satisfaction: z.enum(['very_disappointed', 'somewhat_disappointed', 'not_disappointed'], {
    required_error: 'Please select how you would feel if you could no longer use this calculator.',
  }),
  mainBenefit: z.string().optional(),
  improvements: z.string().optional(),
  email: z.string().email('Please enter a valid email address').optional().or(z.literal('')),
});

type FeedbackFormValues = z.infer<typeof feedbackFormSchema>;

const FeedbackForm: React.FC = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { toast } = useToast();
  
  // Initialize the form
  const form = useForm<FeedbackFormValues>({
    resolver: zodResolver(feedbackFormSchema),
    defaultValues: {
      satisfaction: undefined,
      mainBenefit: '',
      improvements: '',
      email: '',
    },
  });

  const onSubmit = async (data: FeedbackFormValues) => {
    setIsSubmitting(true);
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      setIsSubmitted(true);
      toast({
        title: 'Thank you for your feedback!',
        description: 'Your input helps us improve the calculator.',
      });
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast({
        title: 'Error submitting feedback',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="text-center">Thank You!</CardTitle>
          <CardDescription className="text-center">
            Your feedback has been submitted and will help us improve the Margin of Safety Calculator.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center pb-6">
          <Button 
            variant="outline" 
            onClick={() => setIsSubmitted(false)}
          >
            Submit Another Response
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Help Us Improve</CardTitle>
        <CardDescription>
          Please take a moment to share your feedback about the Margin of Safety Calculator.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="satisfaction"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>
                    How would you feel if you could no longer use the Margin of Safety Calculator?
                  </FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="space-y-1"
                    >
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="very_disappointed" />
                        </FormControl>
                        <FormLabel className="font-normal">
                          Very disappointed
                        </FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="somewhat_disappointed" />
                        </FormControl>
                        <FormLabel className="font-normal">
                          Somewhat disappointed
                        </FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="not_disappointed" />
                        </FormControl>
                        <FormLabel className="font-normal">
                          Not disappointed
                        </FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="mainBenefit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>What's the main benefit you receive from this calculator?</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Tell us what you value most..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    This helps us understand what's most valuable to our users.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="improvements"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>How can we improve the calculator?</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Suggest features or improvements..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Your email (optional)</FormLabel>
                  <FormControl>
                    <StyledInput placeholder="email@example.com" {...field} />
                  </FormControl>
                  <FormDescription>
                    We'll only use this to follow up on your feedback.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <Button 
              type="submit" 
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};

export default FeedbackForm;