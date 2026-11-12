import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

// តភ្ជាប់ទៅ Backend Socket
const socket = io('http://localhost:3000');

export default function SignalScannerView() {
  const [signals, setSignals] = useState([]);
  const [filter, setFilter] = useState('ALL'); // ALL, SWING, SCALPING

  useEffect(() => {
    // 1. ទាញយក Data ចាស់ៗពេលបើក Website
    fetch('http://localhost:3000/api/signals')
      .then(res => res.json())
      .then(data => {
        if (data.success) setSignals(data.data);
      })
      .catch(err => console.error('Error fetching signals:', err));

    // 2. ស្ដាប់ Signal ថ្មីៗដែល Scan ចូលមករา (Real-time)
    socket.on('newSignal', (newSignal) => {
      setSignals(prev => [newSignal, ...prev]);
    });

    return () => {
      socket.off('newSignal');
    };
  }, []);

  // Filter តាម Swing ឬ Scalping
  const filteredSignals = signals.filter(sig => {
    if (filter === 'ALL') return true;
    return sig.style === filter;
  });

  return (
    <div style={{ padding: '20px', background: '#0e1117', color: '#fff', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>📡 Live Signal Scanner</h2>
        
        {/* Tab បែងចែក Swing / Scalping */}
        <div style={{ display: 'flex', gap: '10px' }}>
          {['ALL', 'SWING', 'SCALPING'].map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 'bold',
                backgroundColor: filter === type ? '#2563eb' : '#1f2937',
                color: '#fff'
              }}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* បង្ហាញជា Cards Grid */}
      <div style={{ display: 'grid', gap: '20px', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {filteredSignals.length === 0 ? (
          <p style={{ color: '#888' }}>No signals found...</p>
        ) : (
          filteredSignals.map((sig) => {
            const isBuy = sig.type === 'BUY';
            return (
              <div key={sig.id} style={{
                background: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '10px',
                padding: '18px',
                borderLeft: `6px solid ${isBuy ? '#10b981' : '#ef4444'}`
              }}>
                {/* Header ៖ Symbol & Type */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '18px', fontWeight: 'bold' }}>{sig.symbol}</span>
                  <span style={{
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    background: isBuy ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    color: isBuy ? '#10b981' : '#ef4444'
                  }}>
                    {sig.type} ({sig.style})
                  </span>
                </div>

                <hr style={{ border: '0.5px solid #30363d', marginBottom: '12px' }} />

                {/* តម្លៃ Entry, TP, SL */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '14px' }}>
                  <div>
                    <span style={{ color: '#888' }}>Entry Price:</span>
                    <p style={{ fontWeight: 'bold', margin: '4px 0 0 0', color: '#60a5fa' }}>{sig.entry}</p>
                  </div>
                  <div>
                    <span style={{ color: '#888' }}>Stop Loss (SL):</span>
                    <p style={{ fontWeight: 'bold', margin: '4px 0 0 0', color: '#ef4444' }}>{sig.sl}</p>
                  </div>
                </div>

                <div style={{ marginTop: '10px', fontSize: '14px' }}>
                  <span style={{ color: '#888' }}>Take Profit (TP):</span>
                  <p style={{ fontWeight: 'bold', margin: '4px 0 0 0', color: '#10b981' }}>
                    {Array.isArray(sig.tp) ? sig.tp.join(' | ') : sig.tp}
                  </p>
                </div>

                {/* Timeframe & Time */}
                <div style={{ marginTop: '15px', display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#888' }}>
                  <span>Timeframe: {sig.timeframe}</span>
                  <span>{new Date(sig.createdAt).toLocaleTimeString()}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}