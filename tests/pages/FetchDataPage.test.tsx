/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import FetchDataPage from '../../src/pages/FetchDataPage'

describe('FetchDataPage', () => {
  it('renders heading and Refresh data button', () => {
    render(
      <MemoryRouter>
        <FetchDataPage />
      </MemoryRouter>
    )
    expect(screen.getByRole('heading', { name: /data \(introspect/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /refresh data/i })).toBeInTheDocument()
  })
})
