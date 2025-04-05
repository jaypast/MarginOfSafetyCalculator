import React from 'react';
import MarginOfSafetyCalculator from '@/components/MarginOfSafetyCalculator';

const Home: React.FC = () => {
  return (
    <div className="min-h-screen bg-neutral-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <MarginOfSafetyCalculator />
      </div>
    </div>
  );
};

export default Home;
