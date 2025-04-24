import React from 'react';
import FeedbackAdmin from '@/components/FeedbackAdmin';

const Admin = () => {
  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
      <FeedbackAdmin />
    </div>
  );
};

export default Admin;