from __future__ import annotations

import json
from enum import Enum
from typing import Any, Dict, List, Optional, Union
from uuid import uuid4

from pydantic import BaseModel, Field, model_validator


class MessageRole(str, Enum):
    USER = "user"
    SYSTEM = "system"
    ASSISTANT = "assistant"
    DEVELOPER = "developer"


class ToolCallOutputStatus(str, Enum):
    SUCCESS = "success"
    ERROR = "error"


class CommandType(str, Enum):
    SET = "Set"
    GET = "Get"
    LIST = "List"
    STATUS = "Status"


class SetCommandArgumentType(str, Enum):
    ROLE = "role"
    MODEL = "model"
    DATABASE = "database"
    DATABASE_UPPER = "Database"
    DATABASE_URL = "database_url"
    DATABASE_URL_UPPER = "DATABASE_URL"


class GetCommandArgumentType(str, Enum):
    ROLE = "role"
    MODEL = "model"
    DATABASE = "database"


class MessageKind(str, Enum):
    HANDSHAKE = "Handshake"
    MESSAGE = "Message"
    CHUNK = "Chunk"
    REASONING = "Reasoning"
    TOOL = "Tool"
    STATUS = "Status"
    HEARTBEAT = "Heartbeat"
    COMMAND = "Command"
    ERROR = "Error"
    USAGE = "Usage"


class ClientHandshakeRequest(BaseModel):
    project_id: str = Field(alias="projectId")
    chat_id: str = Field(alias="chatId")

    model_config = {"populate_by_name": True}


class ErrorMessage(BaseModel):
    error_code: str = Field(alias="errorCode")
    message: str
    data: Optional[Dict[str, Any]] = None
    uuid: str

    model_config = {"populate_by_name": True}


class Heartbeat(BaseModel):
    pass


class ToolCall(BaseModel):
    id: str
    call_id: str
    name: str
    arguments: Dict[str, Any]


class ToolCallOutput(BaseModel):
    id: str
    call_id: str
    status: ToolCallOutputStatus
    output: Dict[str, Any]


class ToolMessage(BaseModel):
    tool_calls: List[ToolCall]
    reasoning: Optional[str] = None


class MessageContent(BaseModel):
    role: MessageRole
    message_type: str
    content: str
    metadata: Optional[Dict[str, Any]] = None

    @classmethod
    def create(
        cls,
        role: MessageRole,
        message_type: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> MessageContent:
        return cls(role=role, message_type=message_type, content=content, metadata=metadata)


PartialChatMessage = MessageContent


class SetCommandArgument(BaseModel):
    key: SetCommandArgumentType
    value: str


class GetCommandArgument(BaseModel):
    value: str


class Command(BaseModel):
    command: CommandType
    arguments: Union[SetCommandArgument, GetCommandArgument, Dict[str, Any]]

    @model_validator(mode="before")
    @classmethod
    def validate_arguments(cls, values):
        if isinstance(values, dict):
            command = values.get("command")
            arguments = values.get("arguments")
            if command and arguments and isinstance(arguments, dict):
                if "SetCommandArgument" in arguments:
                    set_arg = arguments["SetCommandArgument"]
                    values["arguments"] = SetCommandArgument(
                        key=set_arg["key"],
                        value=set_arg["value"],
                    )
                elif "GetCommandArgument" in arguments:
                    get_arg = arguments["GetCommandArgument"]
                    values["arguments"] = GetCommandArgument(value=get_arg["value"])
        return values


class ProtocolPayload(BaseModel):
    heartbeat: Optional[Heartbeat] = Field(None, alias="Heartbeat")
    handshake: Optional[ClientHandshakeRequest] = Field(None, alias="Handshake")
    error: Optional[ErrorMessage] = Field(None, alias="Error")
    message: Optional[MessageContent] = Field(None, alias="Message")
    reasoning: Optional[MessageContent] = Field(None, alias="Reasoning")
    tool: Optional[ToolMessage] = Field(None, alias="Tool")
    command: Optional[Command] = Field(None, alias="Command")

    model_config = {"populate_by_name": True}

    def model_dump(self, **kwargs) -> Dict[str, Any]:
        data = super().model_dump(**kwargs)
        return {k: v for k, v in data.items() if v is not None}

    def model_dump_json(self, **kwargs) -> str:
        json_kwargs = {}
        pydantic_kwargs = {}
        for key, value in kwargs.items():
            if key in ["indent", "separators", "sort_keys", "ensure_ascii", "allow_nan"]:
                json_kwargs[key] = value
            else:
                pydantic_kwargs[key] = value
        data = self.model_dump(**pydantic_kwargs)
        return json.dumps(data, **json_kwargs)

    def get_payload_type(self) -> str:
        if self.heartbeat is not None:
            return "heartbeat"
        if self.handshake is not None:
            return "handshake"
        if self.error is not None:
            return "error"
        if self.message is not None:
            return "message"
        if self.reasoning is not None:
            return "reasoning"
        if self.tool is not None:
            return "tool"
        if self.command is not None:
            return "command"
        return "unknown"


class ProtocolMessage(BaseModel):
    id: str
    kind: MessageKind
    payload: ProtocolPayload
    from_: str = Field(alias="from")
    to: str

    model_config = {"populate_by_name": True}

    @classmethod
    def from_json(cls, json_str: str) -> ProtocolMessage:
        return cls(**json.loads(json_str))

    @classmethod
    def create(
        cls,
        kind: MessageKind,
        payload: ProtocolPayload,
        from_: str,
        to: str,
        message_id: Optional[str] = None,
    ) -> ProtocolMessage:
        return cls(
            id=message_id or str(uuid4()),
            kind=kind,
            payload=payload,
            from_=from_,
            to=to,
        )

    def to_dict(self) -> Dict[str, Any]:
        return self.model_dump(by_alias=True)

    def model_dump(self, **kwargs) -> Dict[str, Any]:
        data = {
            "id": self.id,
            "kind": self.kind.value if isinstance(self.kind, Enum) else self.kind,
            "payload": self.payload.model_dump(**kwargs),
            "from": self.from_,
            "to": self.to,
        }
        return data

    def model_dump_json(self, **kwargs) -> str:
        return json.dumps(self.model_dump(**kwargs))


def create_handshake_message(
    project_id: str,
    chat_id: str,
    from_: str,
    to: str,
    message_id: Optional[str] = None,
) -> ProtocolMessage:
    payload = ProtocolPayload(
        handshake=ClientHandshakeRequest(project_id=project_id, chat_id=chat_id)
    )
    return ProtocolMessage.create(
        kind=MessageKind.HANDSHAKE,
        payload=payload,
        from_=from_,
        to=to,
        message_id=message_id,
    )


def create_text_message(
    role: MessageRole,
    content: str,
    message_type: str = "text",
    from_: str = "server",
    to: str = "client",
    message_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> ProtocolMessage:
    payload = ProtocolPayload(
        message=MessageContent.create(
            role=role,
            message_type=message_type,
            content=content,
            metadata=metadata,
        )
    )
    return ProtocolMessage.create(
        kind=MessageKind.MESSAGE,
        payload=payload,
        from_=from_,
        to=to,
        message_id=message_id,
    )


def create_error_message(
    error_code: str,
    message: str,
    *,
    data: Optional[Dict[str, Any]] = None,
    from_: str = "server",
    to: str = "client",
) -> ProtocolMessage:
    payload = ProtocolPayload(
        error=ErrorMessage(
            error_code=error_code,
            message=message,
            data=data,
            uuid=str(uuid4()),
        )
    )
    return ProtocolMessage.create(
        kind=MessageKind.ERROR,
        payload=payload,
        from_=from_,
        to=to,
    )

