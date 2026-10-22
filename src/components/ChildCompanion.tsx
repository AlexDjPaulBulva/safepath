import React from 'react';
import { ChildView } from './ChildView';

export interface ChildCompanionProps {
  onBack?: () => void;
}

/**
 * ChildCompanion: Plnohodnotné klientské zobrazení dítěte.
 * Zobrazuje čistou navigační Canvas mapu s trasou přiřazenou rodičem,
 * hlasovou navigací, SOS tlačítkem a krizovým SafePassem bez rušivých prvků.
 */
export function ChildCompanion(props: ChildCompanionProps) {
  return <ChildView {...props} />;
}

export { ChildView };
export default ChildCompanion;
