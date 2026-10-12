import type { UiMessage, OperationUiState } from '../hooks/useChat';
import { Blocks } from './Blocks';
import { IconAlert, IconRetry, IconTrash } from './Icons';
import { RichText } from './RichText';

interface Props {
  message: UiMessage;
  operationStates: Record<string, OperationUiState>;
  onConfirm: (id: string) => void;
  onCancel: (id: string) => void;
  onRetry: (message: UiMessage) => void;
  onDiscard: (message: UiMessage) => void;
}

export function MessageView({ message, operationStates, onConfirm, onCancel, onRetry, onDiscard }: Props) {
  if (message.role === 'user') {
    return (
      <div className={`msg msg-user ${message.pending ? 'is-pending' : ''} ${message.failure ? 'is-failed' : ''}`}>
        {message.attachments && message.attachments.length > 0 && (
          <div className="msg-attachments">
            {message.attachments.map((a) => (
              <img key={a.id} src={a.url} alt={a.fileName} loading="lazy" />
            ))}
          </div>
        )}
        {message.text && <div className="bubble">{message.text}</div>}
        {message.failure && (
          <div className="msg-failure" role="alert">
            <IconAlert width={16} height={16} />
            <span>{message.failure.message}</span>
            <div className="msg-failure-actions">
              <button type="button" className="link-btn" onClick={() => onRetry(message)}>
                <IconRetry width={15} height={15} /> Renvoyer
              </button>
              <button type="button" className="link-btn" onClick={() => onDiscard(message)}>
                <IconTrash width={15} height={15} /> Retirer
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="msg msg-assistant">
      <div className="avatar" aria-hidden>
        MG
      </div>
      <div className="msg-body">
        <RichText text={message.text} />
        {message.blocks && message.blocks.length > 0 && (
          <Blocks blocks={message.blocks} operationStates={operationStates} onConfirm={onConfirm} onCancel={onCancel} />
        )}
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="msg msg-assistant" aria-live="polite">
      <div className="avatar" aria-hidden>
        MG
      </div>
      <div className="typing" aria-label="L’assistante réfléchit">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
