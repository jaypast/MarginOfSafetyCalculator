import React, { forwardRef } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface StyledInputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const StyledInput = forwardRef<HTMLInputElement, StyledInputProps>(
  ({ className, ...props }, ref) => {
    return (
      <Input
        className={cn(
          "transition-all duration-300 border border-neutral-300 focus:border-[#1A2942] focus:ring-2 focus:ring-[#1A2942]/10",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

StyledInput.displayName = 'StyledInput';

export { StyledInput };