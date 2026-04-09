import React, { useState } from 'react';
import LoginGate from './components/LoginGate';
import B2CApp from './components/B2CApp';
import NurseryConsole from './components/NurseryConsole';
import { MOCK_USERS } from './mockData';

const App: React.FC = () => {
  const [appMode, setAppMode] = useState<'B2C' | 'NURSERY'>('B2C');

  return (
    <div className="min-h-screen bg-v-dark text-v-light flex flex-col">
      {/* Dev Switcher */}
      <div className="fixed top-2 right-2 z-50 flex space-x-2 bg-v-surface p-1 rounded-full shadow-lg border border-v-primary/30">
        <button
          onClick={() => setAppMode('B2C')}
          className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${appMode === 'B2C' ? 'bg-v-accent text-v-dark' : 'text-v-accent'}`}
        >
          APP UTENTE
        </button>
        <button
          onClick={() => setAppMode('NURSERY')}
          className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${appMode === 'NURSERY' ? 'bg-v-accent text-v-dark' : 'text-v-accent'}`}
        >
          CONSOLE VIVAIO
        </button>
      </div>

      {appMode === 'B2C' ? (
      <LoginGate>
  {(user) => <B2CApp user={user} />}
</LoginGate>
      ) : (
        <NurseryConsole user={MOCK_USERS[1] as any} />
      )}
    </div>
  );
};

export default App;