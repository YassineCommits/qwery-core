from __future__ import annotations

import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _slugify(value: str) -> str:
    normalized = "".join(ch if ch.isalnum() else "-" for ch in value.lower())
    slug = "-".join(part for part in normalized.split("-") if part)
    return slug or value.lower()


def _extract_connection_url(config: Dict[str, Any]) -> Optional[str]:
    if isinstance(config, str):
        return config
    if not isinstance(config, dict):
        return None
    preferred_keys = [
        "connection_url",
        "connectionUrl",
        "connection_string",
        "connectionString",
        "database_url",
        "databaseUrl",
        "url",
        "dsn",
    ]
    for key in preferred_keys:
        value = config.get(key)
        if isinstance(value, str) and value:
            return value
    return None


@dataclass(slots=True)
class DatasourceRecord:
    id: str
    project_id: str
    name: str
    description: str
    slug: str
    datasource_provider: str
    datasource_driver: str
    datasource_kind: str
    config: Dict[str, Any]
    created_by: str
    updated_by: str
    created_at: datetime = field(default_factory=_utcnow)
    updated_at: datetime = field(default_factory=_utcnow)

    @property
    def connection_url(self) -> Optional[str]:
        return _extract_connection_url(self.config)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "project_id": self.project_id,
            "name": self.name,
            "description": self.description,
            "slug": self.slug,
            "datasource_provider": self.datasource_provider,
            "datasource_driver": self.datasource_driver,
            "datasource_kind": self.datasource_kind,
            "config": self.config,
            "connection_url": self.connection_url,
            "created_by": self.created_by,
            "updated_by": self.updated_by,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class DatasourceStore:
    def __init__(self) -> None:
        self._items: Dict[str, DatasourceRecord] = {}
        self._by_project: Dict[str, set[str]] = {}
        self._lock = threading.RLock()

    def list(self, project_id: str) -> List[DatasourceRecord]:
        with self._lock:
            ids = self._by_project.get(project_id, set())
            return [self._items[item_id] for item_id in ids]

    def get(self, datasource_id: str) -> Optional[DatasourceRecord]:
        with self._lock:
            return self._items.get(datasource_id)

    def get_for_project(
        self,
        project_id: str,
        identifier: str,
    ) -> Optional[DatasourceRecord]:
        """Locate datasource by id or slug within a project."""
        with self._lock:
            for datasource_id in self._by_project.get(project_id, set()):
                record = self._items[datasource_id]
                if record.id == identifier or record.slug == identifier:
                    return record
        return None

    def upsert(
        self,
        *,
        project_id: str,
        name: str,
        description: str,
        datasource_provider: str,
        datasource_driver: str,
        datasource_kind: str,
        config: Dict[str, Any],
        created_by: str,
        updated_by: str,
        datasource_id: Optional[str] = None,
        slug: Optional[str] = None,
    ) -> DatasourceRecord:
        with self._lock:
            now = _utcnow()
            if datasource_id and datasource_id in self._items:
                record = self._items[datasource_id]
                record.name = name
                record.description = description
                record.datasource_provider = datasource_provider
                record.datasource_driver = datasource_driver
                record.datasource_kind = datasource_kind
                record.config = config
                record.updated_by = updated_by
                record.updated_at = now
                if slug:
                    record.slug = slug
                return record

            new_id = datasource_id or str(uuid4())
            new_slug = slug or _slugify(name)
            record = DatasourceRecord(
                id=new_id,
                project_id=project_id,
                name=name,
                description=description,
                slug=new_slug,
                datasource_provider=datasource_provider,
                datasource_driver=datasource_driver,
                datasource_kind=datasource_kind,
                config=config,
                created_by=created_by,
                updated_by=updated_by,
                created_at=now,
                updated_at=now,
            )
            self._items[new_id] = record
            self._by_project.setdefault(project_id, set()).add(new_id)
            return record

    def delete(self, project_id: str, datasource_id: str) -> bool:
        with self._lock:
            record = self._items.get(datasource_id)
            if not record or record.project_id != project_id:
                return False
            self._items.pop(datasource_id, None)
            self._by_project.get(project_id, set()).discard(datasource_id)
            if not self._by_project.get(project_id):
                self._by_project.pop(project_id, None)
            return True

    def resolve_connection_url(
        self,
        project_id: str,
        identifier: str,
    ) -> Optional[str]:
        record = self.get_for_project(project_id, identifier)
        if not record:
            return None
        return record.connection_url

