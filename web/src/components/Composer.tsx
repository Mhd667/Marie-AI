import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { UploadView } from '../../../shared/types';
import { useAttachments } from '../hooks/useAttachments';
import { IconClose, IconPaperclip, IconRetry, IconSend } from './Icons';

interface Props {
  disabled: boolean;
  onSend: (text: string, attachments: UploadView[]) => void;
}

export function Composer({ disabled, onSend }: Props) {
  const [text, setText] = useState('');
  const attachments = useAttachments();
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);

  const canSend =
    !disabled &&
    !attachments.uploading &&
    !attachments.hasErrors &&
    (text.trim().length > 0 || attachments.ready.length > 0);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSend) return;
    onSend(text.trim(), attachments.ready);
    setText('');
    attachments.clear();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Entrée envoie sur ordinateur ; sur mobile, le bouton d'envoi est utilisé.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) {
      event.preventDefault();
      submit();
    }
  };

  const hint = attachments.uploading
    ? 'Envoi des photos…'
    : attachments.hasErrors
      ? 'Retirez ou renvoyez les photos en erreur.'
      : null;

  return (
    <form className="composer" onSubmit={submit}>
      {attachments.items.length > 0 && (
        <div className="composer-attachments">
          {attachments.items.map((item) => (
            <div key={item.localId} className={`attachment attachment-${item.status}`} title={item.error ?? item.file.name}>
              <img src={item.previewUrl} alt={item.file.name} />
              {item.status === 'uploading' && <span className="attachment-overlay"><span className="spinner" /></span>}
              {item.status === 'error' && (
                <button type="button" className="attachment-overlay" onClick={() => attachments.retry(item)} aria-label="Renvoyer la photo">
                  <IconRetry width={18} height={18} />
                </button>
              )}
              <button type="button" className="attachment-remove" onClick={() => attachments.remove(item.localId)} aria-label="Retirer la photo">
                <IconClose width={12} height={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      {hint && <p className="composer-hint">{hint}</p>}
      <div className="composer-row">
        <button
          type="button"
          className="icon-btn"
          onClick={() => fileInput.current?.click()}
          disabled={!attachments.canAddMore}
          aria-label="Joindre des photos"
        >
          <IconPaperclip />
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files) attachments.add(event.target.files);
            event.target.value = '';
          }}
        />
        <textarea
          ref={textarea}
          rows={1}
          value={text}
          placeholder="Écrivez à votre assistante…"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files).filter((f) => f.type.startsWith('image/'));
            if (files.length) attachments.add(files);
          }}
          aria-label="Message"
          maxLength={4000}
        />
        <button type="submit" className="send-btn" disabled={!canSend} aria-label="Envoyer">
          <IconSend />
        </button>
      </div>
    </form>
  );
}
