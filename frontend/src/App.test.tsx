import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders smoke test', () => {
    render(<App />)
    // Проверяем, что приложение рендерится без падений
    expect(document.body).toBeTruthy()
  })
})