import { Card, Typography } from 'antd';
import type { ReactNode } from 'react';

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f5f5f5' }}>
      <Card style={{ width: '100%', maxWidth: 440 }}>
        <Typography.Title level={2}>{title}</Typography.Title>
        {children}
      </Card>
    </main>
  );
}
