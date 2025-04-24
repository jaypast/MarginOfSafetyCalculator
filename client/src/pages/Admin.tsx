import React from 'react';
import FeedbackAdmin from '@/components/FeedbackAdmin';
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
      <FeedbackAdmin />
      
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