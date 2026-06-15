const PLAN_REQUEST = "give me full, updated, and detailed execution plan"

const REFRESH_REQUEST = (plan) => `Refresh yourself from this execution plan.

${plan}

Do not implement yet. Only load this plan into context and be ready for the next user instruction.`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const tui = async (api) => {
  let running = false

  async function messages(sessionID) {
    const result = await api.client.session.messages({ sessionID, limit: 200 })
    if (result.error) throw new Error("Failed to load session messages")
    return result.data ?? []
  }

  async function assistantCount(sessionID) {
    return (await messages(sessionID)).filter((item) => item.info.role === "assistant").length
  }

  async function latestAssistantPlan(sessionID, previousCount) {
    const deadline = Date.now() + 10 * 60 * 1000

    while (Date.now() < deadline) {
      const list = await messages(sessionID)
      const assistants = list.filter((item) => item.info.role === "assistant")
      const latest = assistants.at(-1)

      if (assistants.length > previousCount && latest?.info.role === "assistant" && latest.info.time.completed) {
        const text = latest.parts
          .filter((part) => part.type === "text" && !part.synthetic && !part.ignored)
          .map((part) => part.text)
          .join("\n\n")
          .trim()

        if (text) return text
      }

      await sleep(500)
    }

    throw new Error("Timed out waiting for the updated plan")
  }

  async function waitForSessionIdle(sessionID) {
    const deadline = Date.now() + 10 * 60 * 1000

    while (Date.now() < deadline) {
      if (api.state.session.status(sessionID)?.type === "idle") return
      await sleep(500)
    }

    throw new Error("Timed out waiting for the session to become idle")
  }

  async function waitForCompaction(sessionID) {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        off()
        reject(new Error("Timed out waiting for compaction"))
      }, 10 * 60 * 1000)

      const off = api.event.on("session.compacted", (event) => {
        if (event.properties.sessionID !== sessionID) return
        clearTimeout(timeout)
        off()
        resolve()
      })
    })
  }

  async function appendAndSubmit(text) {
    await api.client.tui.clearPrompt()
    await api.client.tui.appendPrompt({ text })
    await api.client.tui.submitPrompt()
  }

  api.keymap.registerLayer({
    commands: [
      {
        name: "plan.compact.restore",
        title: "Compact and restore plan",
        category: "Session",
        namespace: "palette",
        slashName: "plan-compact-restore",
        slashAliases: ["pcr"],
        run: async () => {
          if (running) return
          running = true

          try {
            const route = api.route.current
            const sessionID = route.name === "session" ? route.params.sessionID : undefined
            if (!sessionID) throw new Error("Open a session before running this command")

            const before = await messages(sessionID)
            const latest = before.at(-1)?.info
            if (latest?.agent !== "plan") {
              throw new Error("This command must be run from a session whose latest turn is in Plan mode")
            }

            const count = before.filter((item) => item.info.role === "assistant").length
            await appendAndSubmit(PLAN_REQUEST)
            const plan = await latestAssistantPlan(sessionID, count)

            const compacted = waitForCompaction(sessionID)
            await api.keymap.dispatchCommand("session.compact")
            await compacted
            await waitForSessionIdle(sessionID)

            await api.client.tui.clearPrompt()
            await api.client.tui.appendPrompt({ text: REFRESH_REQUEST(plan) })

            api.ui.toast({ message: "Plan pasted. Review it, then press Enter to restore context.", variant: "success" })
          } catch (error) {
            api.ui.toast({
              message: error instanceof Error ? error.message : "Compact/restore failed",
              variant: "error",
              duration: 7000,
            })
          } finally {
            running = false
          }
        },
      },
    ],
  })
}

export default { id: "plan-compact-restore", tui }
