import React, { useState } from 'react';
import MarginOfSafetyCalculator from '@/components/MarginOfSafetyCalculator';
import FeedbackForm from '@/components/FeedbackForm';
import { Button } from '@/components/ui/button';
import { MessageSquare, ChevronUp, ChevronDown } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const Home: React.FC = () => {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  
  return (
    <div className="min-h-screen bg-neutral-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <MarginOfSafetyCalculator />
        
        {/* Feedback Section */}
        <div className="mt-12 mb-8 max-w-3xl mx-auto">
          <div className="border-t border-neutral-200 pt-8">
            {/* Feedback Dialog */}
            <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
              <DialogTrigger asChild>
                <Button 
                  variant="outline" 
                  className="w-full flex items-center justify-center gap-2 py-6 border-neutral-300 bg-white hover:bg-neutral-50 text-[#1A2942]"
                >
                  <MessageSquare className="h-5 w-5" />
                  Share Feedback
                  {feedbackOpen ? (
                    <ChevronUp className="h-4 w-4 ml-2" />
                  ) : (
                    <ChevronDown className="h-4 w-4 ml-2" />
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Your Feedback</DialogTitle>
                  <DialogDescription>
                    We value your input to improve the Margin of Safety Calculator.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <FeedbackForm />
                </div>
              </DialogContent>
            </Dialog>
          </div>
          
          {/* Footer */}
          <div className="mt-8 text-center text-neutral-500 text-sm">
            <p>© 2025 Margin of Safety Calculator. All rights reserved.</p>
            <p className="mt-1">A tool for value investors to make data-driven investment decisions.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
