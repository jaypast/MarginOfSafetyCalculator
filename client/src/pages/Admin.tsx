import React from 'react';
import FeedbackAdmin from '@/components/FeedbackAdmin';
import CacheStats from '@/components/CacheStats';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

const Admin = () => {
  const handleSignOut = () => {
    localStorage.removeItem('adminKey');
    localStorage.removeItem('isAuthenticated');
    window.location.href = '/';
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
        <div className="lg:col-span-3">
          <h2 className="text-xl font-semibold mb-4">User Feedback</h2>
          <FeedbackAdmin />
        </div>
        <div className="lg:col-span-1">
          <h2 className="text-xl font-semibold mb-4">Performance Metrics</h2>
          <CacheStats />
          <div className="mt-4 text-xs text-gray-500">
            <p>These statistics track the effectiveness of data caching.</p>
            <p className="mt-1">A higher cache hit rate means better application performance and reduced API calls.</p>
          </div>
        </div>
      </div>
      
      <div className="mt-8 border-t pt-4 flex justify-end">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleSignOut}
          className="text-gray-500"
        >
          <LogOut className="h-4 w-4 mr-1" />
          Sign Out
        </Button>
      </div>
    </div>
  );
};

export default Admin;