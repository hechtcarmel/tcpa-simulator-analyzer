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

const PHASES = [
  { value: 'LEARNING', label: 'Learning' },
  { value: 'FEEDBACK_LOOP', label: 'Feedback Loop' },
  { value: 'EXITED', label: 'Exited' },
];

interface PhaseSelectProps {
  value?: string;
  onChange: (value: string | undefined) => void;
  disabled?: boolean;
}

export function PhaseSelect({ value, onChange, disabled }: PhaseSelectProps) {
  const [open, setOpen] = React.useState(false);

  const selectedPhase = PHASES.find((phase) => phase.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[200px] justify-between"
          disabled={disabled}
        >
          {selectedPhase ? selectedPhase.label : 'All Phases'}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandInput placeholder="Search phase..." />
          <CommandEmpty>No phase found.</CommandEmpty>
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
              All Phases
            </CommandItem>
            {PHASES.map((phase) => (
              <CommandItem
                key={phase.value}
                value={phase.value}
                onSelect={(currentValue) => {
                  onChange(currentValue === value ? undefined : currentValue);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    value === phase.value ? 'opacity-100' : 'opacity-0'
                  )}
                />
                {phase.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
