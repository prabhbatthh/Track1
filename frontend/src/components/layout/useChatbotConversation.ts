import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { apiDelete, apiPost, getErrorMessage } from '@/lib/api';
import { CONVERSATION_TREE, type TreeNode } from '@/lib/chatbot';
import { preferredScrollBehavior } from '@/lib/scroll';
import { useAuth } from '@/providers/AuthProvider';

export interface ChatMessage {
  id: string;
  from: 'bot' | 'user';
  text: string;
  source?: 'rag' | 'tag' | 'llm' | 'error';
}

interface ChatApiResponse {
  reply: string;
  source: 'rag' | 'tag' | 'llm' | 'error';
}

// Role-specific quick-action chips shown after login
const ROLE_CHIPS: Record<string, string[]> = {
  member: [
    'What events are coming up?',
    'Show me available books',
    'What is my reading progress?',
    'How do I reserve a book?',
    'How do I book a seat?',
  ],
  guardian: [
    'What events are coming up?',
    'Show me available books',
    'How do I pay a fine?',
    'How do I book a seat for my child?',
  ],
  librarian: [
    'Show me available books',
    'Search for a member',
    'What events are coming up?',
    'How do I issue a book?',
  ],
  manager: [
    'How many members do we have?',
    'What events are coming up?',
    'Show me available books',
    'How do I register a new member?',
  ],
  admin: [
    'How many members do we have?',
    'What events are coming up?',
    'Show me all books',
    'Search for a member by name',
  ],
  'it-head': [
    'How many members do we have?',
    'What events are coming up?',
    'Show me available books',
  ],
};

export function useChatbotConversation() {
  const { t } = useTranslation();
  const { isAuthenticated, role, token } = useAuth();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [chipsUsed, setChipsUsed] = useState(false);

  // Landing (unauthenticated) state — tree navigation
  const [currentNode, setCurrentNode] = useState<TreeNode>(CONVERSATION_TREE['root']);

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: 'greeting', from: 'bot', text: t('chatbot.greeting') },
  ]);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset when auth state — or the active language, via `t` — changes. `t` used to be
  // missing from these deps, so switching language without also logging in/out left the
  // greeting/root text stuck in the old language until the next auth-state change.
  useEffect(() => {
    const greeting = t('chatbot.greeting');
    setChipsUsed(false);
    if (isAuthenticated && role) {
      const chips = ROLE_CHIPS[role] ?? ROLE_CHIPS['member'];
      setMessages([
        { id: 'greeting', from: 'bot', text: greeting },
        {
          id: 'role-intro',
          from: 'bot',
          text: `I can help you with live data or any questions. Try one of the suggestions below, or just type anything!`,
        },
      ]);
      // store chips as a synthetic node so we can render them
      setCurrentNode({
        id: 'role-root',
        botMessage: '',
        options: chips.map((c) => ({ label: c, nextId: '__llm__' })),
      });
    } else {
      setMessages([
        { id: 'greeting', from: 'bot', text: greeting },
        { id: 'root', from: 'bot', text: CONVERSATION_TREE['root'].botMessage },
      ]);
      setCurrentNode(CONVERSATION_TREE['root']);
    }
  }, [isAuthenticated, role, t]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: preferredScrollBehavior(),
    });
  }, [messages, loading]);

  // ── Authenticated: send to LLM backend ───────────────────────────────────
  async function sendToLLM(text: string) {
    if (!token || !text.trim()) return;
    setChipsUsed(true);
    const userMsg: ChatMessage = { id: crypto.randomUUID(), from: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await apiPost<ChatApiResponse>('/chat', { message: text }, token);
      const botMsg: ChatMessage = {
        id: crypto.randomUUID(),
        from: 'bot',
        text: res.reply,
        source: res.source,
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          from: 'bot',
          text: getErrorMessage(err, 'Something went wrong. Please try again.'),
          source: 'error',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  // ── Unauthenticated: tree navigation ─────────────────────────────────────
  function selectTreeOption(label: string, nextId: string) {
    if (isAuthenticated) {
      setChipsUsed(true);
      void sendToLLM(label);
      return;
    }
    const next = CONVERSATION_TREE[nextId];
    if (!next) return;
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), from: 'user', text: label },
      { id: crypto.randomUUID(), from: 'bot', text: next.botMessage },
    ]);
    setCurrentNode(next);
  }

  function handleReset() {
    if (isAuthenticated && role) {
      const chips = ROLE_CHIPS[role] ?? ROLE_CHIPS['member'];
      setMessages([
        { id: 'greeting', from: 'bot', text: t('chatbot.greeting') },
        {
          id: 'role-intro',
          from: 'bot',
          text: 'Try one of the suggestions below, or just type anything!',
        },
      ]);
      setCurrentNode({
        id: 'role-root',
        botMessage: '',
        options: chips.map((c) => ({ label: c, nextId: '__llm__' })),
      });
    } else {
      setMessages([
        { id: 'greeting', from: 'bot', text: t('chatbot.greeting') },
        { id: 'root', from: 'bot', text: CONVERSATION_TREE['root'].botMessage },
      ]);
      setCurrentNode(CONVERSATION_TREE['root']);
    }
    setInput('');
    setChipsUsed(false);
    // clear server-side Redis history
    if (token) {
      void apiDelete('/chat/history', token).catch(() => null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendToLLM(input);
    }
  }

  const showOptions = !chipsUsed && !loading && currentNode.options && currentNode.options.length > 0;
  const showBackButton =
    !isAuthenticated && !loading && (!currentNode.options || currentNode.options.length === 0);

  return {
    isAuthenticated,
    role,
    messages,
    currentNode,
    input,
    setInput,
    loading,
    sendToLLM,
    selectTreeOption,
    handleReset,
    handleKeyDown,
    showOptions,
    showBackButton,
    scrollRef,
  };
}
