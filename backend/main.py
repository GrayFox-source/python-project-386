from fastapi import FastAPI

app = FastAPI(title="Cal.com Clone API")

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "backend"}