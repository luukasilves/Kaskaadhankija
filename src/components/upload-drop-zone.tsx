'use client';

/**
 * A file field you can drop a workbook onto.
 *
 * The mechanics of an upload were the friction, not the format: pick a file,
 * then find the button, then wait for a page, then confirm. Dropping the file
 * submits the form straight away, so the next thing on screen is the preview —
 * which is where the decision actually happens.
 *
 * Plain `<input type="file">` underneath, so it still works without
 * JavaScript, with a keyboard, and on a phone.
 */

import { useRef, useState } from 'react';

export function UploadDropZone({
  name = 'file',
  accept,
  label,
  hint,
}: {
  name?: string;
  accept?: string;
  label: string;
  hint?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);

  const submit = () => input.current?.form?.requestSubmit();

  return (
    <div
      data-testid="upload-drop-zone"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (!file || !input.current) return;
        // Hand the dropped file to the real input, so the form posts it the
        // same way a picked file would.
        const list = new DataTransfer();
        list.items.add(file);
        input.current.files = list.files;
        setChosen(file.name);
        submit();
      }}
      className="rounded-[10px] border-2 border-dashed p-4 text-center transition"
      style={{
        borderColor: dragging ? 'var(--color-brand)' : 'var(--color-border)',
        background: dragging ? 'var(--color-brand-soft)' : undefined,
      }}
    >
      <input
        ref={input}
        type="file"
        name={name}
        accept={accept}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setChosen(file.name);
          submit();
        }}
      />
      <p className="text-[13px]">
        <button
          type="button"
          className="font-semibold text-[var(--color-brand)] underline"
          onClick={() => input.current?.click()}
        >
          {label}
        </button>
      </p>
      {chosen ? (
        <p className="mt-1 text-[12px] font-semibold">{chosen}</p>
      ) : (
        hint && <p className="mt-1 text-[11.5px] text-[var(--color-muted)]">{hint}</p>
      )}
    </div>
  );
}
