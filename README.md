├── client/                      # Frontend React application
│   ├── src/
│   │   ├── components/         # Reusable React components
│   │   │   ├── chat/          # Chat-specific components
│   │   │   │   ├── chat-list.tsx
│   │   │   │   ├── chat-window.tsx
│   │   │   │   └── message-input.tsx
│   │   │   └── ui/            # UI components (shadcn)
│   │   ├── hooks/             # Custom React hooks
│   │   ├── lib/               # Utility functions and configurations
│   │   │   ├── queryClient.ts # React Query setup
│   │   │   └── websocket.ts   # WebSocket connection management
│   │   ├── pages/             # Application pages/routes
│   │   │   ├── auth.tsx       # Authentication page
│   │   │   ├── chat.tsx       # Main chat page
│   │   │   └── not-found.tsx  # 404 page
│   │   ├── App.tsx            # Root component
│   │   ├── index.css          # Global styles
│   │   └── main.tsx           # Application entry point
│   └── index.html             # HTML template
├── server/                     # Backend Express server
│   ├── index.ts               # Server entry point
│   ├── routes.ts              # API routes and WebSocket handling
│   ├── storage.ts             # Data storage implementation
│   └── vite.ts               # Vite development server setup
├── shared/                    # Shared code between client and server
│   └── schema.ts             # TypeScript types and Zod schemas
├── uploads/                   # File upload directory
├── package.json              # Project dependencies
├── tsconfig.json            # TypeScript configuration
└── vite.config.ts          # Vite build configuration

```

## Local Development Setup

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev