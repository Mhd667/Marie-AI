import { useCallback, useEffect, useRef, useState } from 'react';
import type { UploadView } from '../../../shared/types';
import { api } from '../api/client';

export interface Attachment {
  localId: string;
  file: File;
  previewUrl: string;
  status: 'uploading' | 'ready' | 'error';
  upload?: UploadView;
  error?: string;
}

const MAX_FILES = 10;
const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * Photos jointes au message en cours. Chaque photo est envoyée au serveur dès sa sélection,
 * où elle est réellement stockée (zone d'attente) ; elle n'est associée à un produit
 * qu'après confirmation d'une opération.
 */
export function useAttachments() {
  const [items, setItems] = useState<Attachment[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => () => itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl)), []);

  const update = (localId: string, patch: Partial<Attachment>) =>
    setItems((current) => current.map((item) => (item.localId === localId ? { ...item, ...patch } : item)));

  const upload = useCallback(async (item: Attachment) => {
    update(item.localId, { status: 'uploading', error: undefined });
    try {
      const [stored] = await api.uploadImages([item.file]);
      update(item.localId, stored ? { status: 'ready', upload: stored } : { status: 'error', error: 'Envoi refusé.' });
    } catch (error) {
      update(item.localId, { status: 'error', error: error instanceof Error ? error.message : 'Envoi impossible.' });
    }
  }, []);

  const add = useCallback(
    (files: FileList | File[]) => {
      const room = MAX_FILES - itemsRef.current.length;
      const accepted = Array.from(files).slice(0, Math.max(room, 0));
      const next: Attachment[] = accepted.map((file) => {
        const base: Attachment = {
          localId: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
          file,
          previewUrl: URL.createObjectURL(file),
          status: 'uploading',
        };
        if (!ACCEPTED.includes(file.type)) return { ...base, status: 'error', error: 'Format non pris en charge.' };
        if (file.size > MAX_BYTES) return { ...base, status: 'error', error: 'Image trop lourde (8 Mo max.).' };
        return base;
      });
      setItems((current) => [...current, ...next]);
      next.filter((item) => item.status === 'uploading').forEach((item) => void upload(item));
    },
    [upload],
  );

  const remove = useCallback((localId: string) => {
    setItems((current) => {
      const item = current.find((i) => i.localId === localId);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return current.filter((i) => i.localId !== localId);
    });
  }, []);

  const clear = useCallback(() => {
    // Les aperçus locaux restent utiles tant que le message s'affiche : on libère après un court délai.
    const old = itemsRef.current;
    setItems([]);
    setTimeout(() => old.forEach((item) => URL.revokeObjectURL(item.previewUrl)), 60_000);
  }, []);

  return {
    items,
    add,
    remove,
    retry: upload,
    clear,
    uploading: items.some((i) => i.status === 'uploading'),
    hasErrors: items.some((i) => i.status === 'error'),
    ready: items.flatMap((i) => (i.status === 'ready' && i.upload ? [i.upload] : [])),
    canAddMore: items.length < MAX_FILES,
  };
}
