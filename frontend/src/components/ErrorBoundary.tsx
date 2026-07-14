import React from 'react';

interface Props {
  children: React.ReactNode;
}
interface State {
  hasError: boolean;
  error: Error | null;
}

// Uygulama genelinde render hatalarını yakalar. Böylece bir bileşen çökse bile
// kullanıcı "siyah ekran" yerine kurtarma ekranı görür ve hata konsola yazılır.
class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Teşhis için: gerçek hata + bileşen yığını
    console.error('[ErrorBoundary] Yakalanan hata:', error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 24,
          textAlign: 'center',
          background: '#0f1117',
          color: '#e8eaf0',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 40 }}>😵‍💫</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Bir şeyler ters gitti</h1>
        <p style={{ fontSize: 14, color: '#5c6380', maxWidth: 360, margin: 0 }}>
          Beklenmedik bir hata oluştu. Sayfayı yenilemek genellikle sorunu çözer.
        </p>
        <button
          onClick={this.handleReload}
          style={{
            marginTop: 8,
            padding: '10px 24px',
            borderRadius: 12,
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 14,
            color: '#fff',
            background: 'linear-gradient(135deg, #7C3AED 0%, #8B5CF6 100%)',
          }}
        >
          Sayfayı Yenile
        </button>
        {this.state.error && (
          <pre
            style={{
              marginTop: 12,
              maxWidth: 480,
              maxHeight: 160,
              overflow: 'auto',
              fontSize: 11,
              color: '#5c6380',
              background: '#161b27',
              border: '1px solid #242b3d',
              borderRadius: 8,
              padding: 12,
              textAlign: 'left',
              whiteSpace: 'pre-wrap',
            }}
          >
            {this.state.error.message}
          </pre>
        )}
      </div>
    );
  }
}

export default ErrorBoundary;
