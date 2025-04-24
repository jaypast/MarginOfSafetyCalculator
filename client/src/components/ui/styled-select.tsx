import React, { forwardRef } from 'react';
import { 
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

// Re-export the necessary Select components
export { 
  SelectContent,
  SelectItem,
  SelectValue
};

// Create a styled select trigger
const StyledSelectTrigger = forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof SelectTrigger>>(
  ({ className, children, ...props }, ref) => {
    return (
      <SelectTrigger
        ref={ref}
        className={cn(
          "transition-all duration-300 border border-neutral-300 focus:border-[#1A2942] focus:ring-2 focus:ring-[#1A2942]/10",
          className
        )}
        {...props}
      >
        {children}
      </SelectTrigger>
    );
  }
);

StyledSelectTrigger.displayName = 'StyledSelectTrigger';

// Create a styled select component
const StyledSelect = Object.assign(Select, {
  Trigger: StyledSelectTrigger,
  Content: SelectContent,
  Item: SelectItem,
  Value: SelectValue
});

export { StyledSelect };