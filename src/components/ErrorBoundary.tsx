import { Component, type ReactNode } from 'react'

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="banner bad" role="alert">
        Something went wrong on this screen: {this.state.error.message}
        <span className="spacer" />
        <button className="btn sm" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    )
  }
}
