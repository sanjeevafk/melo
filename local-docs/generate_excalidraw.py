import json
import uuid

def gen_id():
    return uuid.uuid4().hex[:8]

class ExcalidrawBuilder:
    def __init__(self, bg_color="#121212"):
        self.elements = []
        self.bg_color = bg_color

    def add_rect(self, x, y, w, h, text="", bg="#1e1e1e", stroke="#555555", text_color="#ffffff", stroke_width=2, roundness=3):
        rect_id = gen_id()
        rect = {
            "id": rect_id,
            "type": "rectangle",
            "x": x,
            "y": y,
            "width": w,
            "height": h,
            "angle": 0,
            "strokeColor": stroke,
            "backgroundColor": bg,
            "fillStyle": "solid",
            "strokeWidth": stroke_width,
            "strokeStyle": "solid",
            "roughness": 0,
            "opacity": 100,
            "groupIds": [],
            "frameId": null_val(),
            "roundness": {"type": roundness},
            "seed": 1000 + len(self.elements),
            "version": 1,
            "versionNonce": 1,
            "isDeleted": False,
            "boundElements": [],
            "updated": 1,
            "link": None,
            "locked": False
        }
        self.elements.append(rect)

        if text:
            text_id = gen_id()
            rect["boundElements"].append({"id": text_id, "type": "text"})
            # approximate text sizing
            lines = text.split("\n")
            line_height = 18
            total_text_h = len(lines) * line_height
            text_y = y + (h - total_text_h) / 2
            
            txt_elem = {
                "id": text_id,
                "type": "text",
                "x": x + 10,
                "y": text_y,
                "width": w - 20,
                "height": total_text_h,
                "angle": 0,
                "strokeColor": text_color,
                "backgroundColor": "transparent",
                "fillStyle": "solid",
                "strokeWidth": 1,
                "strokeStyle": "solid",
                "roughness": 0,
                "opacity": 100,
                "groupIds": [],
                "frameId": null_val(),
                "roundness": None,
                "seed": 2000 + len(self.elements),
                "version": 1,
                "versionNonce": 1,
                "isDeleted": False,
                "boundElements": None,
                "updated": 1,
                "link": None,
                "locked": False,
                "text": text,
                "fontSize": 14,
                "fontFamily": 1,
                "textAlign": "center",
                "verticalAlign": "middle",
                "baseline": total_text_h - 4,
                "containerId": rect_id,
                "originalText": text,
                "lineHeight": 1.25
            }
            self.elements.append(txt_elem)
        return rect_id

    def add_orthogonal_arrow(self, points, start_x, start_y, stroke="#888888", stroke_width=2):
        # points are relative to start_x, start_y: e.g. [[0, 0], [0, 50], [100, 50]]
        arrow_id = gen_id()
        last_pt = points[-1]
        w = max(abs(p[0]) for p in points) or 10
        h = max(abs(p[1]) for p in points) or 10
        arrow = {
            "id": arrow_id,
            "type": "arrow",
            "x": start_x,
            "y": start_y,
            "width": w,
            "height": h,
            "angle": 0,
            "strokeColor": stroke,
            "backgroundColor": "transparent",
            "fillStyle": "solid",
            "strokeWidth": stroke_width,
            "strokeStyle": "solid",
            "roughness": 0,
            "opacity": 100,
            "groupIds": [],
            "frameId": null_val(),
            "roundness": {"type": 2},
            "seed": 3000 + len(self.elements),
            "version": 1,
            "versionNonce": 1,
            "isDeleted": False,
            "boundElements": [],
            "updated": 1,
            "link": None,
            "locked": False,
            "points": points,
            "lastCommittedPoint": None,
            "startBinding": None,
            "endBinding": None,
            "startArrowhead": None,
            "endArrowhead": "arrow"
        }
        self.elements.append(arrow)
        return arrow_id

    def add_label(self, x, y, text, color="#aaaaaa", font_size=12, align="center"):
        text_id = gen_id()
        lines = text.split("\n")
        total_h = len(lines) * (font_size * 1.3)
        w = max(len(l) for l in lines) * (font_size * 0.6)
        txt = {
            "id": text_id,
            "type": "text",
            "x": x,
            "y": y,
            "width": w,
            "height": total_h,
            "angle": 0,
            "strokeColor": color,
            "backgroundColor": "transparent",
            "fillStyle": "solid",
            "strokeWidth": 1,
            "strokeStyle": "solid",
            "roughness": 0,
            "opacity": 100,
            "groupIds": [],
            "frameId": null_val(),
            "roundness": None,
            "seed": 4000 + len(self.elements),
            "version": 1,
            "versionNonce": 1,
            "isDeleted": False,
            "boundElements": None,
            "updated": 1,
            "link": None,
            "locked": False,
            "text": text,
            "fontSize": font_size,
            "fontFamily": 1,
            "textAlign": align,
            "verticalAlign": "top",
            "baseline": total_h - 4,
            "containerId": None,
            "originalText": text,
            "lineHeight": 1.25
        }
        self.elements.append(txt)
        return text_id

    def export(self):
        return {
            "type": "excalidraw",
            "version": 2,
            "source": "https://excalidraw.com",
            "elements": self.elements,
            "appState": {
                "viewBackgroundColor": self.bg_color,
                "gridSize": 20
            },
            "files": {}
        }

def null_val():
    return None

def build_diagram():
    b = ExcalidrawBuilder(bg_color="#0f1117")

    # ----------------------------------------------------
    # SECTION 1: SYSTEM ARCHITECTURE (TOP HALF)
    # ----------------------------------------------------
    b.add_label(50, 30, "ECHOREAD: SYSTEM ARCHITECTURE & DATA FLOW", color="#00ffcc", font_size=20, align="left")
    b.add_label(50, 60, "Decoupled WebAudio Client + FastAPI Temporal Orchestrator", color="#778899", font_size=13, align="left")

    # Outer Container 1: Client (Vite + React)
    b.add_rect(50, 90, 380, 480, "", bg="#131620", stroke="#2a3042", stroke_width=2, roundness=3)
    b.add_label(70, 105, "CLIENT: BROWSER (Vite + React)", color="#38bdf8", font_size=15, align="left")

    # Client Subcomponents
    b.add_rect(70, 140, 340, 65, "Web Audio Engine\nPlayback · Ducking · 150ms Procedural Chime", bg="#1a2030", stroke="#3b82f6", text_color="#e2e8f0")
    b.add_rect(70, 220, 340, 65, "Synchronized Transcript & Horizon\nWord-by-Word Scroll · Locked Spoiler Shield", bg="#1a2030", stroke="#3b82f6", text_color="#e2e8f0")
    b.add_rect(70, 300, 340, 65, "Push-to-Talk (PTT) Controller\nSpacebar Listener · MediaRecorder Stream", bg="#1a2030", stroke="#3b82f6", text_color="#e2e8f0")
    b.add_rect(70, 380, 340, 65, "Context Inspector Drawer\n90s Rolling Buffer · Blocked Chunks Counter", bg="#1a2030", stroke="#3b82f6", text_color="#e2e8f0")
    b.add_rect(70, 460, 340, 80, "Auto-Rewind Controller\nSeeks -5000ms · Smooth Fade-in on Resume", bg="#1a2030", stroke="#10b981", text_color="#e2e8f0")

    # Outer Container 2: Backend (FastAPI Orchestrator)
    b.add_rect(540, 90, 660, 480, "", bg="#131620", stroke="#2a3042", stroke_width=2, roundness=3)
    b.add_label(560, 105, "BACKEND: FASTAPI LOCAL ORCHESTRATOR", color="#a855f7", font_size=15, align="left")

    # Backend Subcomponents
    b.add_rect(560, 140, 290, 75, "1. Speech-to-Text (STT)\nfaster-whisper (base.en / small.en)\nLatency: ~180ms", bg="#1f1830", stroke="#a855f7", text_color="#e2e8f0")
    
    b.add_rect(880, 140, 300, 75, "2. Temporal Spoiler Guard\nFilter: end_time_ms <= current_playback_ms\nPrunes all future plot twists", bg="#2c1424", stroke="#f43f5e", stroke_width=2, text_color="#ffe4e6")
    
    b.add_rect(560, 240, 290, 95, "3. Hybrid RAG Search\nGoogle EmbeddingGemma-2 (768d)\n+ SQLite BM25 Keyword Search\nLatency: ~15ms", bg="#1e2238", stroke="#6366f1", text_color="#e2e8f0")
    
    b.add_rect(880, 240, 300, 95, "4. Context Assembler\n• Verbatim 90s Immediate Slice\n• Retrieved Past Chunks\n• Closed-World System Prompt", bg="#1a2432", stroke="#0284c7", text_color="#e2e8f0")
    
    b.add_rect(560, 360, 290, 80, "5. Reasoning LLM\nllama-cpp-python (Qwen-2.5-3B / Gemma)\nStreaming Sentence 1: ~200ms", bg="#2d2215", stroke="#f59e0b", text_color="#fef3c7")
    
    b.add_rect(880, 360, 300, 80, "6. Companion Voice (TTS)\nKokoro-82M (kokoro-onnx)\nStreaming WAV chunks: ~250ms", bg="#142c22", stroke="#10b981", text_color="#d1fae5")
    
    b.add_rect(560, 465, 620, 75, "SQLite Local Storage\n• media_items · transcript_chunks (word-level timing JSON) · embeddings", bg="#181e2b", stroke="#475569", text_color="#94a3b8")

    # Connectors between Client and Backend (Orthogonal right angles)
    # PTT to STT: (410, 332) -> (475, 332) -> (475, 177) -> (560, 177)
    b.add_orthogonal_arrow([[0, 0], [65, 0], [65, -155], [150, -155]], 410, 332, stroke="#38bdf8", stroke_width=2)
    b.add_label(430, 230, "Mic Audio +\ncurrent_ms", color="#38bdf8", font_size=11)

    # STT to Spoiler Guard: (850, 177) -> (880, 177)
    b.add_orthogonal_arrow([[0, 0], [30, 0]], 850, 177, stroke="#a855f7")

    # Spoiler Guard to Context Assembler: (1030, 215) -> (1030, 240)
    b.add_orthogonal_arrow([[0, 0], [0, 25]], 1030, 215, stroke="#f43f5e")

    # Hybrid RAG to Context Assembler: (850, 287) -> (880, 287)
    b.add_orthogonal_arrow([[0, 0], [30, 0]], 850, 287, stroke="#6366f1")

    # Context Assembler to LLM: (1030, 335) -> (1030, 345) -> (705, 345) -> (705, 360)
    b.add_orthogonal_arrow([[0, 0], [0, 15], [-325, 15], [-325, 25]], 1030, 335, stroke="#0284c7")

    # LLM to TTS: (850, 400) -> (880, 400)
    b.add_orthogonal_arrow([[0, 0], [30, 0]], 850, 400, stroke="#f59e0b")

    # TTS back to Web Audio Engine: (880, 420) -> (490, 420) -> (490, 172) -> (410, 172)
    b.add_orthogonal_arrow([[0, 0], [-390, 0], [-390, -248], [-470, -248]], 880, 420, stroke="#10b981", stroke_width=2)
    b.add_label(430, 370, "Streaming\nTTS Audio", color="#10b981", font_size=11)

    # ----------------------------------------------------
    # SECTION 2: AUDIO PLAYER & VOICE INTERRUPT FSM (BOTTOM HALF)
    # ----------------------------------------------------
    b.add_label(50, 620, "FINITE STATE MACHINE 1: PLAYER & VOICE INTERRUPT CYCLE", color="#00ffcc", font_size=18, align="left")
    b.add_label(50, 645, "Deterministic voice interruption, audio ducking, and 5s auto-rewind lifecycle", color="#778899", font_size=13, align="left")

    fsm_y = 680
    # State 1: IDLE
    b.add_rect(50, fsm_y, 160, 60, "STATE: IDLE\nBook loaded & ready", bg="#181e2b", stroke="#64748b", text_color="#cbd5e1")

    # State 2: PLAYING
    b.add_rect(270, fsm_y, 180, 60, "STATE: PLAYING\nAudio playing\nTranscript sync active", bg="#142c22", stroke="#10b981", stroke_width=2, text_color="#d1fae5")

    # State 3: DUCKED_PAUSED
    b.add_rect(510, fsm_y, 180, 60, "STATE: DUCKED_PAUSED\n150ms Chime plays\nAudio muted at current_ms", bg="#2c1424", stroke="#f43f5e", text_color="#ffe4e6")

    # State 4: LISTENING
    b.add_rect(750, fsm_y, 180, 60, "STATE: LISTENING\nMediaRecorder active\nUser speaking query", bg="#1f1830", stroke="#a855f7", text_color="#f3e8ff")

    # State 5: REASONING
    b.add_rect(990, fsm_y, 210, 60, "STATE: REASONING\nSTT -> Temporal RAG -> LLM\nSpoiler filter enforced", bg="#1e2238", stroke="#6366f1", text_color="#e0e7ff")

    # Next row for FSM
    fsm_y2 = 800
    # State 6: SPEAKING
    b.add_rect(990, fsm_y2, 210, 60, "STATE: SPEAKING\nKokoro TTS streaming\nCompanion voice audio", bg="#2d2215", stroke="#f59e0b", stroke_width=2, text_color="#fef3c7")

    # State 7: POST_ANSWER_WINDOW
    b.add_rect(650, fsm_y2, 250, 60, "STATE: POST_ANSWER_WINDOW\nStory: 1.5s silence window\nStudy: 4.0s follow-up mic open", bg="#1a2432", stroke="#0284c7", text_color="#e0f2fe")

    # State 8: AUTO_REWINDING
    b.add_rect(270, fsm_y2, 280, 60, "STATE: AUTO_REWINDING\nSeek: current_ms - 5000ms\nFade-in audio volume (400ms)", bg="#142c22", stroke="#10b981", stroke_width=2, text_color="#d1fae5")

    # Transitions for FSM 1 (Orthogonal right angles)
    # IDLE -> PLAYING
    b.add_orthogonal_arrow([[0, 0], [60, 0]], 210, fsm_y + 30, stroke="#64748b")
    b.add_label(220, fsm_y + 10, "Play", color="#94a3b8", font_size=11)

    # PLAYING -> DUCKED_PAUSED
    b.add_orthogonal_arrow([[0, 0], [60, 0]], 450, fsm_y + 30, stroke="#f43f5e")
    b.add_label(455, fsm_y + 10, "[Spacebar] down", color="#f43f5e", font_size=11)

    # DUCKED_PAUSED -> LISTENING
    b.add_orthogonal_arrow([[0, 0], [60, 0]], 690, fsm_y + 30, stroke="#a855f7")
    b.add_label(700, fsm_y + 10, "Chime ends", color="#a855f7", font_size=11)

    # LISTENING -> REASONING
    b.add_orthogonal_arrow([[0, 0], [60, 0]], 930, fsm_y + 30, stroke="#6366f1")
    b.add_label(935, fsm_y + 10, "[Spacebar] up", color="#6366f1", font_size=11)

    # REASONING -> SPEAKING
    b.add_orthogonal_arrow([[0, 0], [0, 60]], 1095, fsm_y + 60, stroke="#f59e0b")
    b.add_label(1105, fsm_y + 70, "1st Chunk", color="#f59e0b", font_size=11)

    # SPEAKING -> POST_ANSWER_WINDOW
    b.add_orthogonal_arrow([[0, 0], [-90, 0]], 990, fsm_y2 + 30, stroke="#0284c7")
    b.add_label(910, fsm_y2 + 10, "TTS done", color="#0284c7", font_size=11)

    # POST_ANSWER_WINDOW -> AUTO_REWINDING
    b.add_orthogonal_arrow([[0, 0], [-100, 0]], 650, fsm_y2 + 30, stroke="#10b981")
    b.add_label(565, fsm_y2 + 10, "Silence timeout", color="#10b981", font_size=11)

    # POST_ANSWER_WINDOW -> LISTENING (Follow-up loop in study mode)
    b.add_orthogonal_arrow([[0, 0], [0, -50], [60, -50], [60, -60]], 780, fsm_y2, stroke="#a855f7")
    b.add_label(795, fsm_y2 - 35, "Follow-up question", color="#a855f7", font_size=10)

    # AUTO_REWINDING -> PLAYING (Loop back to Playing state)
    b.add_orthogonal_arrow([[0, 0], [0, -60]], 360, fsm_y2, stroke="#10b981", stroke_width=2)
    b.add_label(370, fsm_y2 - 35, "Rewind complete", color="#10b981", font_size=11)

    # ----------------------------------------------------
    # SECTION 3: TEMPORAL SPOILER GUARD RETRIEVAL FSM (BOTTOM)
    # ----------------------------------------------------
    b.add_label(50, 910, "FINITE STATE MACHINE 2: TEMPORAL SPOILER GUARD & RETRIEVAL", color="#00ffcc", font_size=18, align="left")
    b.add_label(50, 935, "Guaranteed spoiler prevention via mathematical timestamp pruning", color="#778899", font_size=13, align="left")

    fsm_y3 = 970
    b.add_rect(50, fsm_y3, 190, 70, "QUERY INGESTED\nUser text + current_ms\n+ book_id", bg="#1e182e", stroke="#a855f7", text_color="#e2e8f0")

    b.add_rect(300, fsm_y3, 180, 70, "MODE DECISION\nEvaluate Listening Mode\n(Story vs Study)", bg="#1e2238", stroke="#3b82f6", text_color="#e2e8f0")

    # Branch Story Mode (Top)
    b.add_rect(540, fsm_y3 - 40, 320, 65, "BRANCH: STORY MODE (SPOILER SHIELD)\nSQL: WHERE end_time_ms <= :current_ms\nPrompt: Strict Closed-World (No external lore)", bg="#2c1424", stroke="#f43f5e", stroke_width=2, text_color="#ffe4e6")

    # Branch Study Mode (Bottom)
    b.add_rect(540, fsm_y3 + 45, 320, 65, "BRANCH: STUDY MODE (GLOBAL SYNTHESIS)\nSQL: No temporal bound (Whole doc search)\nPrompt: Conceptual Analogy + Glossary", bg="#142c22", stroke="#10b981", text_color="#d1fae5")

    # Convergence: CONTEXT PACKAGED
    b.add_rect(930, fsm_y3, 270, 70, "CONTEXT ASSEMBLED\nVerbatim [t - 90s, t] buffer\n+ Filtered RAG chunks -> LLM", bg="#1a2432", stroke="#0284c7", stroke_width=2, text_color="#e0f2fe")

    # Transitions for FSM 2
    # Ingested -> Decision
    b.add_orthogonal_arrow([[0, 0], [60, 0]], 240, fsm_y3 + 35, stroke="#3b82f6")

    # Decision -> Story Mode
    b.add_orthogonal_arrow([[0, 0], [30, 0], [30, -40], [60, -40]], 480, fsm_y3 + 35, stroke="#f43f5e", stroke_width=2)
    b.add_label(485, fsm_y3 - 10, "Story Mode", color="#f43f5e", font_size=11)

    # Decision -> Study Mode
    b.add_orthogonal_arrow([[0, 0], [30, 0], [30, 45], [60, 45]], 480, fsm_y3 + 35, stroke="#10b981")
    b.add_label(485, fsm_y3 + 60, "Study Mode", color="#10b981", font_size=11)

    # Story Mode -> Assembled
    b.add_orthogonal_arrow([[0, 0], [35, 0], [35, 40], [70, 40]], 860, fsm_y3 - 7, stroke="#f43f5e", stroke_width=2)

    # Study Mode -> Assembled
    b.add_orthogonal_arrow([[0, 0], [35, 0], [35, -45], [70, -45]], 860, fsm_y3 + 77, stroke="#10b981")

    return b.export()

if __name__ == "__main__":
    data = build_diagram()
    output_path = "/home/sanjeev/Downloads/echoread/echoread-architecture-and-fsm.excalidraw"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"Successfully generated {output_path} with {len(data['elements'])} elements!")
