import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import FeedbackForm from '@/components/FeedbackForm';
import FeedbackAdmin from '@/components/FeedbackAdmin';

const Feedback: React.FC = () => {
  const [activeTab, setActiveTab] = useState('form');
  
  return (
    <main className="container mx-auto py-10 px-4">
      <h1 className="text-2xl font-bold text-[#1A2942] text-center mb-6">
        Margin of Safety Calculator Feedback
      </h1>
      
      <Tabs
        defaultValue="form"
        value={activeTab}
        onValueChange={setActiveTab}
        className="max-w-5xl mx-auto"
      >
        <TabsList className="grid grid-cols-2 w-[400px] mx-auto mb-6">
          <TabsTrigger value="form">Provide Feedback</TabsTrigger>
          <TabsTrigger value="stats">View Results</TabsTrigger>
        </TabsList>
        
        <TabsContent value="form" className="mt-2">
          <FeedbackForm />
        </TabsContent>
        
        <TabsContent value="stats" className="mt-2">
          <FeedbackAdmin />
        </TabsContent>
      </Tabs>
    </main>
  );
};

export default Feedback;