import React, { Component, ErrorInfo, ReactNode } from "react"
import { AlertTriangle, RotateCw } from "lucide-react"

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[React ErrorBoundary caught error]:", error, errorInfo)
    this.setState({ error, errorInfo })
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen w-screen bg-neutral-950 text-neutral-100 p-6 select-none">
          <div className="max-w-lg w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-red-400">
              <div className="h-10 w-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-neutral-100">Application Rendering Error</h2>
                <p className="text-xs text-neutral-400">An unexpected exception occurred in the UI component tree.</p>
              </div>
            </div>

            {this.state.error && (
              <div className="bg-neutral-950 border border-neutral-800/80 rounded-xl p-3 text-xs font-mono text-red-300 max-h-40 overflow-y-auto custom-scrollbar leading-relaxed">
                {this.state.error.toString()}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={this.handleReset}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs h-9 px-4 rounded-xl flex items-center space-x-2 transition-colors"
              >
                <RotateCw className="h-3.5 w-3.5" />
                <span>Reload Application</span>
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
