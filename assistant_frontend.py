import requests
import gradio as gr
import os

def process_text(recipient_number, reason, relation, context):
    url = "http://localhost:3000/sends-message"  # Replace with your actual API endpoint
    payload = {
        "number": recipient_number,
        "reason": reason,
        "relation": relation,
        "context": context
    }
    response = requests.post(url, json=payload)
    response.raise_for_status()  # Raise an error for non-200 status codes
    data = response.json()
    return data["msg"]

interface = gr.Interface(
    fn=process_text,
    inputs=[
        gr.Textbox(label="Recipient Number"),
        gr.Textbox(label="Your reason to send the message is..."),
        gr.Textbox(label="The recipient is your ... (ie. Mom)"),
        gr.Textbox(label="A bit of context of the conversation...")
    ],
    outputs="text",
    title="Send a Message to Someone Using AI"
)

interface.launch(share=True)