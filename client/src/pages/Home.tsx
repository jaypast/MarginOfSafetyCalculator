import React from 'react';
import { Link } from 'wouter';
import MarginOfSafetyCalculator from '@/components/MarginOfSafetyCalculator';
import { MessageSquare } from 'lucide-react';

const Home: React.FC = () => {
  return (
    <div className="min-h-screen bg-neutral-50 py-8 px-4 sm:px-6 lg:px-8 flex flex-col">
      <div className="max-w-7xl mx-auto flex-grow">
        <MarginOfSafetyCalculator />
      </div>
      
      {/* Feedback link at the bottom */}
      <div className="mt-12 pb-8 text-center">
        <Link href="/feedback">
          <div className="inline-flex items-center gap-2 text-neutral-600 hover:text-neutral-900 transition-colors py-2 px-4 rounded-md hover:bg-neutral-100 cursor-pointer">
            <MessageSquare className="h-5 w-5" />
            <span>Share Your Feedback</span>
          </div>
        </Link>
      </div>
    </div>
  );
};

export default Home;
