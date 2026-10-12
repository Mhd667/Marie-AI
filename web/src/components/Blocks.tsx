import type { MessageBlock } from '../../../shared/types';
import type { OperationUiState } from '../hooks/useChat';
import { ChangesList } from './ChangesList';
import { IconAlert, IconCheck } from './Icons';
import { OperationCard } from './OperationCard';
import { ProductList } from './ProductList';
import { SummaryCard } from './SummaryCard';

interface Props {
  blocks: MessageBlock[];
  operationStates: Record<string, OperationUiState>;
  onConfirm: (id: string) => void;
  onCancel: (id: string) => void;
}

export function Blocks({ blocks, operationStates, onConfirm, onCancel }: Props) {
  return (
    <div className="blocks">
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'products':
            return <ProductList key={index} title={block.title} products={block.products} />;
          case 'operation':
            return (
              <OperationCard
                key={block.operation.id}
                operation={block.operation}
                state={operationStates[block.operation.id]}
                onConfirm={onConfirm}
                onCancel={onCancel}
              />
            );
          case 'summary':
            return <SummaryCard key={index} summary={block.summary} />;
          case 'changes':
            return <ChangesList key={index} changes={block.changes} />;
          case 'notice':
            return (
              <p key={index} className={`notice notice-${block.tone}`}>
                {block.tone === 'success' ? <IconCheck width={16} height={16} /> : <IconAlert width={16} height={16} />}
                {block.text}
              </p>
            );
        }
      })}
    </div>
  );
}
