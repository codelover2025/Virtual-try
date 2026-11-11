'use client';

import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input, Button } from '@vj/ui';
import { useDebounce } from '@vj/hooks';

export interface ProductSearchProps {
  value: string;
  onChange: (query: string) => void;
  placeholder?: string;
  className?: string;
}

export function ProductSearch({
  value,
  onChange,
  placeholder = 'Search by name, gemstone, style…',
  className,
}: ProductSearchProps) {
  const [localVal, setLocalVal] = useState(value);
  const debouncedVal = useDebounce(localVal, 300);

  useEffect(() => {
    setLocalVal(value);
  }, [value]);

  useEffect(() => {
    onChange(debouncedVal);
  }, [debouncedVal, onChange]);

  return (
    <div className={`relative flex items-center ${className ?? ''}`}>
      <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-muted-foreground" />
      <Input
        value={localVal}
        onChange={(e) => setLocalVal(e.target.value)}
        placeholder={placeholder}
        className="h-10 rounded-full pl-9 pr-9 text-xs sm:text-sm bg-background border-border/70 focus-visible:ring-primary/30"
      />
      {localVal ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => {
            setLocalVal('');
            onChange('');
          }}
          className="absolute right-1.5 h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
          <span className="sr-only">Clear search</span>
        </Button>
      ) : null}
    </div>
  );
}
