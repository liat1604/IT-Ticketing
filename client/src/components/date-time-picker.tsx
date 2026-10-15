import { useState } from "react";
import { CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type DateTimePickerProps = {
  label: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
};

export function DateTimePicker({
  label,
  name,
  value,
  defaultValue = "",
  onChange,
  required = false,
  disabled = false,
}: DateTimePickerProps) {
  const controlled = value !== undefined;
  const [savedValue, setSavedValue] = useState(defaultValue);
  const currentValue = value ?? savedValue;
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState("");

  function startPicking() {
    const [currentDate = "", currentTime = ""] = currentValue.split("T");
    setDate(currentDate);
    setTime(currentTime.slice(0, 5));
    setError("");
    setOpen(true);
  }

  function saveSelection() {
    if (!date && !time && !required) {
      commit("");
      setOpen(false);
      return;
    }
    if (!date || !time) {
      setError("Choose both a date and a time.");
      return;
    }
    commit(`${date}T${time}`);
    setOpen(false);
  }

  function commit(nextValue: string) {
    if (!controlled) setSavedValue(nextValue);
    onChange?.(nextValue);
  }

  return (
    <>
      {name && <input type="hidden" name={name} value={currentValue} />}
      <Button
        type="button"
        variant="outline"
        className="w-full justify-start gap-2 font-normal"
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={startPicking}
      >
        <CalendarDays className="size-4 text-muted-foreground" />
        <span className={currentValue ? "" : "text-muted-foreground"}>
          {currentValue ? formatDateTime(currentValue) : `Select ${label.toLowerCase()}`}
        </span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>Choose a date and time, then save to return to your form.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-medium">
              <span>Date</span>
              <Input
                type="date"
                required={required}
                value={date}
                onChange={(event) => { setDate(event.target.value); setError(""); }}
              />
            </label>
            <label className="space-y-2 text-sm font-medium">
              <span>Time</span>
              <Input
                type="time"
                required={required}
                value={time}
                onChange={(event) => { setTime(event.target.value); setError(""); }}
              />
            </label>
          </div>
          {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
          <DialogFooter>
            {!required && currentValue && (
              <Button type="button" variant="outline" onClick={() => { commit(""); setOpen(false); }}>
                Clear
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" className="bg-[#4B2C70] text-white hover:bg-[#3d235d]" onClick={saveSelection}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
