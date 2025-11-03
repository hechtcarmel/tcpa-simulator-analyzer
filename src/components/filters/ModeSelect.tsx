'use client';

import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const MODES = [
  { value: 'DEPLETION_POINTER', label: 'Depletion Pointer' },
  { value: 'BID_REDUCTION_POINTER', label: 'Bid Reduction Pointer' },
  { value: 'SIMULATOR_BASED_POINTER', label: 'Simulator Based Pointer' },
  { value: 'BID_POINTER', label: 'Bid Pointer' },
];

interface ModeSelectProps {
  value?: string;
  onChange: (value: string | undefined) => void;
  disabled?: boolean;
}

export function ModeSelect({ value, onChange, disabled }: ModeSelectProps) {
  const [open, setOpen] = React.useState(false);

  const selectedMode = MODES.find((mode) => mode.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[240px] justify-between"
          disabled={disabled}
        >
          {selectedMode ? selectedMode.label : 'All Modes'}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0">
        <Command>
          <CommandInput placeholder="Search mode..." />
          <CommandEmpty>No mode found.</CommandEmpty>
          <CommandGroup>
            <CommandItem
              onSelect={() => {
                onChange(undefined);
                setOpen(false);
              }}
            >
              <Check
                className={cn(
                  'mr-2 h-4 w-4',
                  !value ? 'opacity-100' : 'opacity-0'
                )}
              />
              All Modes
            </CommandItem>
            {MODES.map((mode) => (
              <CommandItem
                key={mode.value}
                value={mode.value}
                onSelect={(currentValue) => {
                  onChange(currentValue === value ? undefined : currentValue);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    value === mode.value ? 'opacity-100' : 'opacity-0'
                  )}
                />
                {mode.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
