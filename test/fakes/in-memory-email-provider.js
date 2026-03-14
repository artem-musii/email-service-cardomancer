const InMemoryEmailProvider = ({ shouldFail = false } = {}) => {
  const sent = []
  const send = async (params) => {
    if (shouldFail) return { success: false, error: 'Simulated failure' }
    sent.push(params)
    return { success: true }
  }
  return { send, sent }
}

export { InMemoryEmailProvider }
