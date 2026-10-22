import React from 'react';

// Konuşan kişinin yanında beliren ses dalgası: dört çubuk farklı hızlarda
// yükselip alçalır. Konuşma bitince çubuklar yumuşakça sönümlenir.
const SpeakingBars: React.FC<{ active: boolean; className?: string }> = ({ active, className = '' }) => (
    <span className={`speaking-bars ${active ? 'is-active' : ''} ${className}`} aria-hidden>
        <span /><span /><span /><span />
    </span>
);

export default SpeakingBars;
